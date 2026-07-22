// The single initTRPC init + the procedure ladder. Lives apart from router.ts so sub-routers import
// t/the procedures without a cycle through the root router. Built once: publicProcedure →
// authedProcedure → adminProcedure, each rung adding a stricter gate (plus the multiHumanProcedure
// side-rung). Middleware order: tracing span (first, so a 401/429 below still shows the procedure name)
// → domain-error map → rate-limit gate → [multi-human belt] → auth + CSRF gate → admin gate.
//
// The gates read the seam-resolved ctx.auth and gate on plain fields — no db round-trip. adminMiddleware
// is transport's layer-1 authority gate; the domain verb's requireAdmin is layer-2 (defense in depth).

import { DomainRateLimitError } from "@orb/kit/errors";
import { initTRPC, TRPCError } from "@trpc/server";
import { requireAdmin } from "#domain/admin";
import { securityEvent, setSpanAttrs, span } from "#foundation/observability";
import type { Context } from "./context";
import { classifyDomainError, domainReason } from "./error-mapping";

// The error formatter rides the honest domain reason code on `data.reason` (only a DomainOperationError
// carries one — see domainReason). Additive: `data.reason` is typed `string | undefined` end-to-end, so
// the inferred client error shape gains the optional field; a codeless error serialises without the key.
export const t = initTRPC.context<Context>().create({
  errorFormatter: ({ shape, error }) => ({ ...shape, data: { ...shape.data, reason: domainReason(error) } }),
});

// One span per procedure. A typed domain error resolves the span to OK (the error is data, badged as an
// attribute); only an uncaught mid-handler throw marks the span error.
const tracingMiddleware = t.middleware(({ path, type, next }) =>
  span(
    `trpc.${path}`,
    async () => {
      const result = await next();
      setSpanAttrs({ "trpc.ok": result.ok });
      if (!result.ok) {
        setSpanAttrs({ "trpc.errorCode": result.error.code });
      }
      return result;
    },
    { "trpc.type": type, "trpc.path": path },
  ),
);

// A subscription generator throws after this middleware has returned, so it bypasses this map —
// subscriptions wrap their source in withSubscriptionErrors instead.
const domainErrorMiddleware = t.middleware(async ({ next }) => {
  const result = await next();
  if (!result.ok) {
    const mapped = classifyDomainError(result.error);
    if (mapped !== null) {
      throw mapped;
    }
  }
  return result;
});

// The injected rate-limit gate; transport hands it the request facts, it owns the bucket policy. A
// DomainRateLimitError is audited then re-thrown → mapped to TOO_MANY_REQUESTS.
const rateLimitMiddleware = t.middleware(async ({ ctx, path, type, next }) => {
  try {
    await ctx.rateLimit.enforce({ path, type, principal: ctx.auth, clientIp: ctx.clientIp });
  } catch (err) {
    if (err instanceof DomainRateLimitError) {
      securityEvent("rate_limit", { path }, "security: request throttled");
    }
    throw err;
  }
  return next();
});

export const publicProcedure = t.procedure.use(tracingMiddleware).use(domainErrorMiddleware).use(rateLimitMiddleware);

// authedProcedure: a resolved identity is required (ctx.auth === null → 401), plus the CSRF mitigation —
// a cookie-authenticated mutation must carry the custom header. The gate keys on Principal.via: a
// header/fallback request and all queries/subscriptions are exempt.
const authMiddleware = t.middleware(({ ctx, type, path, next }) => {
  if (ctx.auth === null) {
    securityEvent("auth_required", { path }, "security: unauthenticated request rejected");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (type === "mutation" && ctx.auth.via === "cookie" && !ctx.csrfHeaderPresent) {
    securityEvent("csrf_rejected", { path, handle: ctx.auth.handle }, "security: cookie mutation missing CSRF header");
    throw new TRPCError({ code: "FORBIDDEN", message: "Missing CSRF header." });
  }
  return next({ ctx: { auth: ctx.auth } });
});

export const authedProcedure = publicProcedure.use(authMiddleware);

// multiHumanProcedure: while the deployment cannot seat a second human, the surface is refused as
// nonexistent — a uniform NOT_FOUND, never a FORBIDDEN that would advertise the capability. Fires before
// the auth gate so even an anonymous probe sees the same shape tRPC gives an unmounted procedure.
const multiHumanMiddleware = t.middleware(({ ctx, path, next }) => {
  if (!ctx.multiHumanCapable) {
    securityEvent("multi_human_unavailable", { path }, "security: multi-human surface refused (deployment not multi-human capable)");
    throw new TRPCError({ code: "NOT_FOUND", message: `No procedure found on path "${path}"` });
  }
  return next();
});

export const multiHumanProcedure = publicProcedure.use(multiHumanMiddleware).use(authMiddleware);

// adminProcedure (layer 1): authed + the global-role gate. requireAdmin reads the seam-resolved
// Principal.role; no db round-trip. A deny is audited then surfaced as 403.
const adminMiddleware = t.middleware(({ ctx, path, next }) => {
  if (ctx.auth === null) {
    securityEvent("auth_required", { path }, "security: unauthenticated request rejected");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  try {
    requireAdmin(ctx.auth);
  } catch (denial) {
    securityEvent("admin_required", { path, handle: ctx.auth.handle, role: ctx.auth.role }, "security: non-admin attempted admin endpoint");
    throw denial;
  }
  return next({ ctx: { auth: ctx.auth } });
});

export const adminProcedure = authedProcedure.use(adminMiddleware);
