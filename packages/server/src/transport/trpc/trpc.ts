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
import { getLog, securityEvent, setSpanAttrs, span } from "#foundation/observability";
import type { Context } from "./context.ts";
import { classifyDomainError, domainReason, providerFaultOf } from "./error-mapping.ts";

// SSE heartbeat (SSE-1 §8) — the deployment-wide subscription liveness policy, set once here because
// `initTRPC.create` is the ONE home for it. tRPC ships ping DISABLED by default and no client inactivity
// timeout, which is survivable while a tab holds N independent streams (one dead socket costs one lane) and
// NOT survivable under the multiplex, where a silently-dead socket is a TOTAL freshness blackout. The ping
// keeps intermediaries (Caddy, the dev proxy) from idling an otherwise-quiet stream; `reconnectAfterInactivityMs`
// at 3× the interval is what makes the CLIENT notice a socket that stopped without closing. Both keys
// verified against @trpc/server 11.18 (`SSEPingOptions` / `SSEClientOptions`). Strictly an improvement for
// the per-proc streams too, which is why it lands before any of them fold.
const SSE_PING_MS = 15_000;
const SSE_RECONNECT_AFTER_INACTIVITY_MS = 45_000;

/**
 * THE MESSAGE EVERY UNCLASSIFIED THROW GETS, in place of its own.
 *
 * `getErrorShape` builds `shape.message` as `error.message`, and `TRPCError`'s constructor inherits the
 * CAUSE's message when no explicit one is given — so a throw nothing modelled put its raw text on the wire.
 * The surveyed reach: 37 server files / 64 call sites hand an `@orb/inference` failure straight through,
 * and before the ProviderError arm in `error-mapping.ts` every one of them answered a 500 carrying
 * whatever string the throw happened to hold (an absolute host cache path from `local-light`, an
 * uncapped unsanitized upstream HTML body from `fetchJson` — both since fixed at their mint sites, both
 * found only because the channel was audited, which is the argument for closing the channel rather than
 * auditing the messages).
 *
 * SO THE BELT IS ABOUT THE CLASS, NOT THOSE TWO. An unclassified error is by definition one no author
 * reasoned about at this boundary; its message is an unreviewed string of unknown provenance, and the next
 * one will arrive from a `catch` nobody has written yet. It is also the EXACT rule the room path already
 * obeys — `stream/socket.ts::roomFailure` collapses a non-domain throw to "The room stopped unexpectedly."
 * with the comment "internals never reach a subscriber". This generalises that ratified rule from the room
 * to every procedure.
 *
 * STRUCTURAL, not conditional: `message` is destructured OUT of `shape` below, exactly as `stack` is out of
 * `shape.data`, so the spread CANNOT carry it and a wire message only exists where one is written by hand.
 *
 * Nothing is lost server-side: `domainErrorMiddleware` logs the real error (with the procedure that
 * produced it) to pino + the log ring + `/api/_debug/errors`, which is where an operator-facing string
 * belongs. Nothing is lost client-side either, for anything MODELLED: a classified error keeps its own
 * message and rides `data.reason`.
 */
const UNCLASSIFIED_FAULT_MESSAGE = "The server hit an unexpected error. It was logged server-side.";

// The error formatter rides the honest domain reason code on `data.reason` (a DomainOperationError's
// `.code`, or `provider_<kind>` for a classified provider failure — see domainReason). Additive:
// `data.reason` is typed `string | undefined` end-to-end, so the inferred client error shape gains the
// optional field; a codeless error serialises without the key.
//
// IT ALSO SUBSTITUTES THE MESSAGE OF EVERY INTERNAL_SERVER_ERROR (see UNCLASSIFIED_FAULT_MESSAGE above).
//
// IT ALSO STRIPS `stack` — UNCONDITIONALLY, in every env. tRPC's `getErrorShape` attaches the raw
// `Error.stack` to `shape.data` whenever `config.isDev`, and `isDev` defaults to
// `NODE_ENV !== "production"` resolved ONCE at `create()` below. On 2026-08-09 the public deployment was
// being served by a DEV process (a `node --watch` out of a worktree behind the proxy), so every tRPC error
// — including the pre-auth 401 an anonymous prober gets — returned absolute host paths, the OS username and
// exact dep versions. Authz was intact; this was pure info-disclosure. Cutting the process over to
// production fixed the INSTANCE; this line fixes the STRUCTURE, so no env, no launch mistake and no future
// `isDev` default can put a stack frame on the wire. The strip is a rest-destructure rather than a
// conditional so the leaking state is unrepresentable, not merely unlikely. Server-side stacks stay
// reachable where they belong: pino + the request ring + /api/_debug (host-gated).
export const t = initTRPC.context<Context>().create({
  errorFormatter: ({ shape, error }) => {
    const { stack: _neverOnTheWire, ...data } = shape.data;
    const { message: onlyWhenClassified, ...envelope } = shape;
    return {
      ...envelope,
      message: data.code === "INTERNAL_SERVER_ERROR" ? UNCLASSIFIED_FAULT_MESSAGE : onlyWhenClassified,
      data: { ...data, reason: domainReason(error) },
    };
  },
  sse: {
    ping: { enabled: true, intervalMs: SSE_PING_MS },
    client: { reconnectAfterInactivityMs: SSE_RECONNECT_AFTER_INACTIVITY_MS },
  },
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
//
// IT ALSO LOGS THE UNMAPPED ONES — the other half of the silent-500 (docs/design/streaming-shape-churn.md
// §7.5). `classifyDomainError` returning null means the throw is NOT a modelled domain outcome, so tRPC
// serialises it as INTERNAL_SERVER_ERROR: a genuine fault. Nothing in the ladder logged that, so a 500 whose
// cause never happened to log for itself (a DB fault, a bug, a provider error on a path infra did not
// classify) reached the browser with ZERO server-side trace. Now every 500 lands in pino + the log ring +
// `/api/_debug/errors`, carrying the procedure that produced it.
//
// GATED ON THE CODE, not on `mapped === null`: an UNAUTHORIZED/FORBIDDEN/NOT_FOUND thrown by the gates above
// is also un-mappable here (it is already a TRPCError, not a DomainError), and those are expected refusals
// with their own `securityEvent` line — logging them at error would bury the real faults in 401 noise.
const domainErrorMiddleware = t.middleware(async ({ path, type, next }) => {
  const result = await next();
  if (!result.ok) {
    const mapped = classifyDomainError(result.error);
    if (mapped !== null) {
      // A CLASSIFIED PROVIDER FAULT STILL OWES A TRACE, and this is now the ONLY place its real message
      // exists: most `ProviderErrorKind`s send fixed host copy instead of the error's own text
      // (error-mapping.ts's header states the rule), so without this line a rate-limit, a dead key or an
      // upstream 5xx would leave nothing behind anywhere. `toLog()` is the error's own contractually
      // secret-free record. WARN, not error: a provider refusing us is not a bug of ours — the `error`
      // level below stays reserved for faults nobody modelled.
      //
      // SUBSCRIPTIONS ARE THE SIBLING SITE: a generator throws long after this middleware returned, so
      // `withSubscriptionErrors` carries the same three lines. Two call sites of one log line, not two
      // policies — keep them in step.
      const provider = providerFaultOf(mapped);
      if (provider !== null) {
        getLog().warn({ ...provider.toLog(), event: "trpc.provider", path, type }, `trpc: provider failure on ${path} (${provider.kind})`);
      }
      throw mapped;
    }
    if (result.error.code === "INTERNAL_SERVER_ERROR") {
      getLog().error(
        { err: result.error.cause ?? result.error, event: "trpc.unhandled", path, type },
        `trpc: unmapped error on ${path} — surfaced to the caller as a 500`,
      );
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
//
// WHY tRPC's belt keys on `cookie` ONLY, unlike the byte-ingest routes' `via !== "header"` (#300): because
// `entry/app.ts` refuses every POST to the tRPC mount whose content-type is not `application/json`, and
// `application/json` is NOT a CORS-"simple" content-type — so a cross-site page cannot make the browser
// send one without a preflight this app never grants (it mounts no CORS middleware). That leaves the
// `fallback` (loopback owner) arm safely un-gated here, which is what the un-cookied loopback dev tooling
// (multi-user-seed, curl harvests) relies on. The byte-ingest routes gate fallback instead because they
// must ACCEPT `multipart/form-data`, which IS CORS-simple — see upload.ts's authCsrfGuard.
//
// THE BELT IS LOAD-BEARING, NOT DEFENCE IN DEPTH. This comment used to justify the `cookie`-only keying by
// claiming a tRPC mutation "requires application/json"; it does not. `@trpc/server` 11.18's
// `getContentTypeHandler` also matches `multipart/form-data` and `application/octet-stream` and dispatches
// both as `type:"mutation"`, and multipart is exactly the CORS-simple type a plain cross-site `<form>` can
// post. Behaviorally proven at the mount: before the belt, a multipart POST with no `x-orb-csrf` on the
// fallback arm RAN `tag.pruneUnusedTags` and returned 200 (pin: tests/server/entry/app.test.ts, the
// content-type-belt describe). Delete or narrow that belt and this gate is open again on every
// `AUTH_FALLBACK=owner` box.
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
