// transport/trpc/trpc — the single `initTRPC` init + the procedure ladder (core/Tier-4-Transport.md
// §"trpc.ts"). Lives apart from `router.ts` so sub-routers import `t`/the procedures without a cycle
// through the root router. The ladder is built ONCE: `publicProcedure → authedProcedure → adminProcedure`,
// each rung adding a stricter gate (plus the `multiHumanProcedure` side-rung — the PD-106 single-user
// capability belt). Middleware stack order (Esoteric #8 — tracing FIRST so a 401/429 from
// a gate below still shows the procedure name + outcome):
//   tracing span → domain-error map → rate-limit gate → [multi-human belt] → auth + CSRF gate → admin gate.
//
// The gates read the seam-resolved `ctx.auth` (`Principal`) and gate on plain fields — NO db round-trip
// (the role was resolved ONCE at `entry/auth/seam.ts`; spine §1). `adminMiddleware` is transport's
// LAYER-1 authority gate; the domain verb's `requireAdmin` is LAYER-2 (defense in depth — a verb reached
// from a non-tRPC path is still gated). BOTH route through the one `can()` seam (`#domain/admin`), the
// sole `role`-comparison site (spine Invariant #6).

import { DomainRateLimitError } from "@orb/kit/errors";
import { initTRPC, TRPCError } from "@trpc/server";
import { requireAdmin } from "#domain/admin";
import { securityEvent, setSpanAttrs, span } from "#foundation/observability";
import type { Context } from "./context";
import { classifyDomainError } from "./error-mapping";

export const t = initTRPC.context<Context>().create();

// One span per procedure — the trace root every downstream db/provider span nests into. A typed domain
// error resolves the span to OK (the procedure ran; the error is data, badged as an attribute); only an
// uncaught mid-handler throw marks the span error.
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

// Domain-error → tRPC-code mapping. The classifier (`./error-mapping`) walks `.cause` and is tested in
// isolation. NOTE (Esoteric #5): a subscription generator throws AFTER this middleware has returned, so
// it bypasses this map — subscriptions wrap their source in `withSubscriptionErrors` instead.
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

// The rate-limit gate — the INJECTED seam (`ctx.rateLimit`, wired at `entry/` from the
// `transport/rate-limit` primitive). Transport hands the gate the request facts; the gate owns the bucket
// policy (anonymous per-IP vs authed per-user vs the $/GPU `aiTurn` bucket vs the per-member COUNT
// budget). `ctx.auth` is populated at the seam regardless of the auth gate below, so the gate can key the
// authed bucket here. A `DomainRateLimitError` is audited then re-thrown → mapped to TOO_MANY_REQUESTS.
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

export const publicProcedure = t.procedure
  .use(tracingMiddleware)
  .use(domainErrorMiddleware)
  .use(rateLimitMiddleware);

// authedProcedure: a resolved identity is required (`ctx.auth === null` → 401). PLUS the CSRF mitigation:
// a COOKIE-authenticated MUTATION must carry the custom header (`csrfHeaderPresent`, read off the request
// at the entry mount — transport does no header parsing). The gate keys on `Principal.via` — a
// header/fallback request (no cross-site surface) and ALL queries/subscriptions (incl. the SSE stream)
// are exempt, so the zero-infra default and the stream are untouched. Narrows `auth` to non-null
// downstream.
const authMiddleware = t.middleware(({ ctx, type, path, next }) => {
  if (ctx.auth === null) {
    securityEvent("auth_required", { path }, "security: unauthenticated request rejected");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  if (type === "mutation" && ctx.auth.via === "cookie" && !ctx.csrfHeaderPresent) {
    securityEvent(
      "csrf_rejected",
      { path, handle: ctx.auth.handle },
      "security: cookie mutation missing CSRF header",
    );
    throw new TRPCError({ code: "FORBIDDEN", message: "Missing CSRF header." });
  }
  return next({ ctx: { auth: ctx.auth } });
});

export const authedProcedure = publicProcedure.use(authMiddleware);

// multiHumanProcedure: the AUTH_MODE capability belt (PD-106; Tier-4 §"multi-human surface"). Every
// multi-human procedure (the invites/roster/notifications surfaces + the notifications subscription)
// rides this rung: in a `single-user` deployment the surface is refused AS NONEXISTENT — a uniform
// NOT_FOUND ("404 in single-user"), never a FORBIDDEN/coded 400 that would advertise the capability. The
// belt fires BEFORE the auth gate so even an anonymous probe sees the same shape tRPC gives an unmounted
// procedure. `ctx.singleUserMode` is derived ONCE at the entry mount from the frozen env (transport reads
// no env). The chat `single_user_mode` op-code (CHAT_OP_CODES) stays the DOMAIN-side discriminator for
// verb-level refusals inside chat; the transport shape is deliberately the leak-free 404.
const multiHumanMiddleware = t.middleware(({ ctx, path, next }) => {
  if (ctx.singleUserMode) {
    securityEvent(
      "single_user_mode",
      { path },
      "security: multi-human surface refused in single-user mode",
    );
    throw new TRPCError({ code: "NOT_FOUND", message: `No procedure found on path "${path}"` });
  }
  return next();
});

export const multiHumanProcedure = publicProcedure.use(multiHumanMiddleware).use(authMiddleware);

// adminProcedure (LAYER-1): authed + the global-role gate. `requireAdmin` (the `can()` seam, owner ∪
// admin — D17) reads the seam-resolved `Principal.role`; NO db round-trip. A deny is audited then surfaced
// as 403 (the matching `requireAdmin` inside the admin verbs is LAYER-2).
const adminMiddleware = t.middleware(({ ctx, path, next }) => {
  if (ctx.auth === null) {
    securityEvent("auth_required", { path }, "security: unauthenticated request rejected");
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required." });
  }
  try {
    requireAdmin(ctx.auth);
  } catch (denial) {
    // Audit the denial, then re-throw the original `DomainForbiddenError` — `domainErrorMiddleware`
    // (upstream in the stack) maps it to a 403. Re-throwing the original keeps the typed cause intact.
    securityEvent(
      "admin_required",
      { path, handle: ctx.auth.handle, role: ctx.auth.role },
      "security: non-admin attempted admin endpoint",
    );
    throw denial;
  }
  return next({ ctx: { auth: ctx.auth } });
});

export const adminProcedure = authedProcedure.use(adminMiddleware);
