// The per-request Hono middleware. Assigns/echoes X-Request-Id, opens the request-root tracing span (the
// parent for every downstream span), binds the request-scoped logger, and logs one structured `request`
// line + records the request ring. Skips /api/_debug/* so introspection traffic doesn't evict real traces.

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Principal } from "@orb/contracts/identity";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { bindRequestUser, getLog, getRequestUserId, recordRequest, runInRequest } from "./logger.ts";
import { recordThrownRequest, withRequestSpan } from "./tracing.ts";

const DEBUG_PREFIX = "/api/_debug";
const INTERNAL_ERROR_STATUS = 500;

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

/**
 * Per-request observability: assigns a request id, stamps it on the response as `X-Request-Id` (so a caller
 * can grab it and query /api/_debug/logs?requestId=… or /traces/:requestId — see `stampRequestId` for WHERE
 * that stamp has to happen), binds a request-scoped logger AND the request-root span, and logs one
 * structured line per request. The stamped id is the SAME id every sink below records — never a second mint.
 */
export const observability: MiddlewareHandler = (c, next) => {
  // If a trusted upstream already minted a correlation id, propagate it; else a fresh UUID. The charset
  // guard prevents log-injection from a client setting their own header.
  const incoming = c.req.header("x-request-id");
  const requestId = incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  const start = performance.now();

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
 * The Hono `app.onError` counterpart of `observability` — the thrown (non-Response) request path. Records
 * the throw on the root span (so /api/_debug/traces shows status:"error"), logs one pino `request.thrown`
 * error line, and returns the same 500 text Hono's default onError returns — an observability fix, not an
 * error-contract change. tRPC throws never reach here (the fetch adapter converts them to a Response first).
 */
export const observabilityErrorHandler: ErrorHandler = (err, c) => {
  recordThrownRequest(err);
  getLog().error({ err }, "request.thrown");
  return c.text("Internal Server Error", INTERNAL_ERROR_STATUS);
};
