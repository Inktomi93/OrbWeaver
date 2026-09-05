// The per-request Hono middleware. Assigns/echoes X-Request-Id, opens the request-root tracing span (the
// parent for every downstream span), binds the request-scoped logger, and logs one structured `request`
// line + records the request ring. Skips /api/_debug/* so introspection traffic doesn't evict real traces.
//
// ASSUMES(single-replica): `OBSERVED` holds THIS process's live Hono contexts, and a context never leaves
// the process that built it — there is no cross-replica question to answer and therefore no DB-backed
// replacement seam to name (unlike the rings it feeds, whose replica scope `logger.ts` declares). The
// entries are request-lifetime and collected with the context.

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Principal } from "@orb/contracts/identity";
import type { Context, ErrorHandler, MiddlewareHandler } from "hono";
import { bindRequestUser, getLog, getRequestUserId, recordRequest, runInRequest } from "./logger.ts";
import { recordThrownRequest, withRequestSpan } from "./tracing.ts";

const DEBUG_PREFIX = "/api/_debug";
const INTERNAL_ERROR_STATUS = 500;
const INTERNAL_ERROR_TEXT = "Internal Server Error";

// The Hono contexts whose request scope THIS middleware opened. A WeakSet keyed on the context object needs
// no `Env` typing (foundation cannot import the app's) and cannot leak — the entry dies with the context.
// It is the discriminator `observabilityErrorHandler` needs: a throw from a middleware mounted ABOVE this
// one never reaches the scope, the span or the ring, and "no active span" alone cannot say so (the
// /api/_debug/* skip below also has none, deliberately).
const OBSERVED = new WeakSet<object>();

// Caps reuse-from-header to 128 chars + a conservative charset so a client can't inject log-line content
// or terminal escapes via a malicious X-Request-Id. Mismatch → a fresh UUID is generated.
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.\-:]{1,128}$/u;

// The /join/<token> invite landing carries a bearer capability in its path, so it must never be
// persisted raw. Every sink below records `path`, so redact the token segment before it reaches any of
// them. Prefix-anchored so sibling paths (/joined, /api/join-anything) are untouched.
const JOIN_TOKEN_PREFIX = "/join/";
function redactSensitivePath(path: string): string {
  return path.startsWith(JOIN_TOKEN_PREFIX) ? `${JOIN_TOKEN_PREFIX}:token` : path;
}

const REQUEST_ID_HEADER = "X-Request-Id";

/**
 * THE stamp (#480), and it must run AFTER `next()`. The pre-`next()` `c.header()` this replaced reached only
 * responses Hono builds from the context — a handler returning its OWN `Response` replaces that, which is
 * every tRPC response (`fetchRequestHandler`'s return value), so the app's primary API surface answered with
 * no correlation handle for /api/_debug/logs?requestId=… at all. Mutating `c.res.headers` after `next()` is
 * exactly how `hono/secure-headers` (and therefore `entry/http/securityHeaders`) gets ITS headers onto those
 * same tRPC responses.
 *
 * This one site is sufficient, including for a THROWN handler: Hono's `compose` catches the throw at its own
 * dispatch frame and runs `app.onError` there, so `next()` resolves normally and `c.res` is already the 500.
 * Pinned by the two FENCE cases in tests/server/entry/app.test.ts (#480) — the belt/415 and the onError/500.
 */
function stampRequestId(c: { readonly res: Response }, requestId: string): void {
  c.res.headers.set(REQUEST_ID_HEADER, requestId);
}

/** THE request-id rule, in one home: if a trusted upstream already minted a correlation id, propagate it;
 *  else a fresh UUID. The charset guard prevents log-injection from a client setting their own header. */
function resolveRequestId(c: Context): string {
  const incoming = c.req.header("x-request-id");
  return incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * Per-request observability: assigns a request id, stamps it on the response as `X-Request-Id` (so a caller
 * can grab it and query /api/_debug/logs?requestId=… or /traces/:requestId — see `stampRequestId` for WHERE
 * that stamp has to happen), binds a request-scoped logger AND the request-root span, and logs one
 * structured line per request. The stamped id is the SAME id every sink below records — never a second mint.
 */
export const observability: MiddlewareHandler = (c, next) => {
  const requestId = resolveRequestId(c);
  const start = performance.now();
  OBSERVED.add(c);

  return runInRequest(requestId, async () => {
    const rawPath = c.req.path;
    const method = c.req.method;
    // Skips both the log line and the trace root — without it every /api/_debug/* GET would land in the
    // trace ring and evict an earlier real trace while the operator browses them.
    if (rawPath.startsWith(DEBUG_PREFIX)) {
      await next();
      stampRequestId(c, requestId);
      return;
    }
    const path = redactSensitivePath(rawPath);

    // Bind the already-resolved caller onto the request-scoped logger so every line emitted during this
    // request (and the request-ring record below) carries userId/handle. The auth middleware runs BEFORE
    // this one (app.ts middleware order) and set the Principal on the Hono context; the logger scope only
    // opens here (runInRequest above), so the bind must happen inside it, not at auth-resolution time. The
    // context accessor is untyped at this tier (foundation can't import the app's Hono Env) — read it via a
    // narrow structural cast. Anonymous requests leave the Principal null → no bind (userId stays absent).
    const principal = (c as { get: (key: "principal") => Principal | null | undefined }).get("principal");
    if (principal !== null && principal !== undefined) {
      bindRequestUser(principal.userId, principal.handle);
    }

    await withRequestSpan(requestId, `http ${method} ${path}`, { "http.method": method, "http.path": path }, async () => {
      await next();
    });
    stampRequestId(c, requestId);

    const durationMs = Math.round(performance.now() - start);
    const status = c.res.status;
    const userId = getRequestUserId();
    getLog().info({ method, path, status, durationMs }, "request");
    recordRequest({
      id: requestId,
      method,
      path,
      status,
      durationMs,
      // performance.timeOrigin + performance.now() is wall-clock now without raw Date.now() — there is no
      // injected clock at the middleware edge, and this is observability metadata, not domain logic.
      at: Math.round(performance.timeOrigin + performance.now()),
      ...(userId !== undefined ? { userId } : {}),
    });
  });
};

/**
 * A throw from a middleware mounted ABOVE {@link observability} — today the principal-resolution middleware
 * (`entry/app.ts`), i.e. an AUTH-INFRASTRUCTURE fault, the class most worth seeing. Hono's `compose()`
 * catches a handler throw at ITS OWN dispatch frame, so an outer middleware's `next()` resolves normally and
 * cannot observe it: `app.onError` is the only place that can (#1479).
 *
 * THE MOUNT ORDER IS NOT THE BUG AND IS NOT TOUCHED. `observability` is mounted AFTER auth deliberately —
 * it reads the already-resolved Principal to bind the request user, and moving it first would widen the
 * request span to include auth's own latency (`entry/app.ts`'s note). This branch adds nothing to the
 * success path: it runs only when the scope was never opened.
 *
 * What it records is a REQUEST INDEX ENTRY, never the error text: the id, the method, the REDACTED path
 * (`/join/<token>` carries a bearer capability — the ring must never hold the raw one) and the 500. The
 * error itself rides the one pino `request.thrown` line, inside a scope bound to the SAME request id, so
 * /api/_debug/logs?requestId=… and /api/_debug/requests agree. `durationMs` is 0 because nothing measured
 * this request — the fault preceded the measurement.
 */
function observeThrowAboveScope(err: unknown, c: Context): Promise<Response> {
  const requestId = resolveRequestId(c);
  const method = c.req.method;
  const path = redactSensitivePath(c.req.path);
  c.header(REQUEST_ID_HEADER, requestId);
  return runInRequest(requestId, async (): Promise<Response> => {
    getLog().error({ err }, "request.thrown");
    // The root span exists only to carry the failure; `recordThrownRequest` marks the span ACTIVE INSIDE
    // this callback as error + adds the `exception` event, and `withRequestSpan`'s OK-set is guarded on
    // exactly that, so the sealed bucket reads status:"error" without this having to throw.
    await withRequestSpan(requestId, `http ${method} ${path}`, { "http.method": method, "http.path": path }, () => {
      recordThrownRequest(err);
    });
    recordRequest({
      id: requestId,
      method,
      path,
      status: INTERNAL_ERROR_STATUS,
      durationMs: 0,
      at: Math.round(performance.timeOrigin + performance.now()),
    });
    return c.text(INTERNAL_ERROR_TEXT, INTERNAL_ERROR_STATUS);
  });
}

/**
 * The Hono `app.onError` counterpart of `observability` — the thrown (non-Response) request path. Records
 * the throw on the root span (so /api/_debug/traces shows status:"error"), logs one pino `request.thrown`
 * error line, and returns the same 500 text Hono's default onError returns — an observability fix, not an
 * error-contract change. tRPC throws never reach here (the fetch adapter converts them to a Response first).
 *
 * TWO ARMS, split on whether this request ever entered the observability scope: the OBSERVED one (a throw at
 * or below the middleware) corrects the already-open root span; the un-observed one is
 * {@link observeThrowAboveScope}. Both return the identical 500.
 */
export const observabilityErrorHandler: ErrorHandler = (err, c) => {
  if (!OBSERVED.has(c)) {
    return observeThrowAboveScope(err, c);
  }
  recordThrownRequest(err);
  getLog().error({ err }, "request.thrown");
  return c.text(INTERNAL_ERROR_TEXT, INTERNAL_ERROR_STATUS);
};
