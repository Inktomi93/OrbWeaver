// foundation/observability/middleware — the per-request Hono middleware. Assigns/echoes X-Request-Id
// (charset-guarded), opens the request-root tracing span (the parent for every downstream span), binds the
// request-scoped logger, and logs one structured `request` line + records the request ring. Mounted by
// `entry/app` (transport/entry reads foundation DOWN). Skips /api/_debug/* so introspection traffic does
// not evict real traces.

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { ErrorHandler, MiddlewareHandler } from "hono";
import { getLog, getRequestUserId, recordRequest, runInRequest } from "./logger";
import { recordThrownRequest, withRequestSpan } from "./tracing";

const DEBUG_PREFIX = "/api/_debug";
const INTERNAL_ERROR_STATUS = 500;

// Caps reuse-from-header to 128 chars + a conservative charset so a client can't inject log-line content
// or terminal escapes via a malicious X-Request-Id. A 36-char UUID fits; Caddy's hex/short-id also pass.
// Mismatch → a fresh UUID is generated. (core/Tier-2-Foundation.md esoteric #11.)
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.\-:]{1,128}$/u;

// The `/join/<token>` invite landing carries a BEARER capability in its path — the raw token redeems room
// membership, so it must NEVER be persisted raw (entry/http/join.ts + transport invites.ts). Every sink
// below (the pino `request` line, the request ring, the trace root name) records `path`, so redact the
// token segment to the route shape `/join/:token` BEFORE it reaches any of them. The redirect form
// (`/?join=<token>`) already stays out — `c.req.path` excludes the query string. Prefix-anchored so sibling
// paths (`/joined`, `/api/join-anything`) are untouched.
const JOIN_TOKEN_PREFIX = "/join/";
function redactSensitivePath(path: string): string {
  return path.startsWith(JOIN_TOKEN_PREFIX) ? `${JOIN_TOKEN_PREFIX}:token` : path;
}

/**
 * Per-request observability: assigns a request id, echoes it as `X-Request-Id` (so a caller can grab it
 * and query /api/_debug/logs?requestId=… or /traces/:requestId), binds a request-scoped logger AND the
 * request-root span, and logs one structured line per request.
 */
export const observability: MiddlewareHandler = (c, next) => {
  // X-Request-Id REUSE: if a trusted upstream (Caddy) already minted a correlation id, propagate it so the
  // proxy-edge and app logs share an id; else a fresh UUID. The charset guard prevents log-injection from a
  // client setting their own header pre-Caddy.
  const incoming = c.req.header("x-request-id");
  const requestId =
    incoming !== undefined && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  c.header("X-Request-Id", requestId);
  const start = performance.now();

  return runInRequest(requestId, async () => {
    const rawPath = c.req.path;
    const method = c.req.method;
    // The introspection API skips both the log line AND the trace root — without it every /api/_debug/* GET
    // would land in the trace ring and evict an earlier real trace while the operator browses them. This
    // check uses the RAW path (a /join landing never lives under /api/_debug); redaction is display-only.
    if (rawPath.startsWith(DEBUG_PREFIX)) {
      await next();
      return;
    }
    // The path that reaches every sink (trace name/attr, the pino line, the request ring) — invite-token
    // segment redacted so the bearer token is never persisted raw.
    const path = redactSensitivePath(rawPath);

    // The root span covers the WHOLE request, so the rendered durations cover the actual wall clock between
    // request-in and response-out.
    await withRequestSpan(
      requestId,
      `http ${method} ${path}`,
      { "http.method": method, "http.path": path },
      async () => {
        await next();
      },
    );

    const durationMs = Math.round(performance.now() - start);
    const status = c.res.status;
    // userId/handle ride on the logger's child bindings (bound at the transport context seam during the
    // handler), so they appear on this line automatically; the request ring needs it passed explicitly.
    const userId = getRequestUserId();
    getLog().info({ method, path, status, durationMs }, "request");
    recordRequest({
      id: requestId,
      method,
      path,
      status,
      durationMs,
      // Epoch-ms for the request-ring record. `performance.timeOrigin` (the epoch anchor of the perf
      // timeline) + `performance.now()` is the wall-clock now WITHOUT raw `Date.now()` — there is no
      // injected clock at the middleware edge, and this is observability metadata, not domain logic.
      at: Math.round(performance.timeOrigin + performance.now()),
      ...(userId !== undefined ? { userId } : {}),
    });
  });
};

/**
 * The Hono `app.onError` counterpart of `observability` — the THROWN (non-Response) request path. Hono's
 * compose() catches a handler throw at ITS origin dispatch frame (BELOW the `observability` middleware), so
 * the throw never rejects the middleware's `next()`: the request-root span would seal as "ok" and Hono's
 * DEFAULT onError logs via raw `console.error` (bypassing pino + the log ring). This handler runs at that
 * origin frame, while the root span is still active in the same await chain, and:
 *   1. records the throw on the root span (`recordThrownRequest`: status→error + the `exception` event) so
 *      /api/_debug/traces shows `status: "error"` instead of a mislabeled "ok";
 *   2. logs ONE pino `request.thrown` error line (the `err` serializer renders the error's type + message
 *      + stack) so /api/_debug/errors + the log ring see it — replacing Hono's console.error bypass;
 *   3. returns the SAME 500 text Hono's default onError returns — this is an OBSERVABILITY fix, NOT an
 *      error-contract change; the client-visible response is unchanged.
 * tRPC throws NEVER reach here: the fetch adapter converts a procedure/createContext throw into a Response
 * before Hono's onError sees it (already recorded by the transport tracing middleware) — so no double-log.
 * Mounted by `entry/app` via `app.onError`.
 */
export const observabilityErrorHandler: ErrorHandler = (err, c) => {
  recordThrownRequest(err);
  getLog().error({ err }, "request.thrown");
  return c.text("Internal Server Error", INTERNAL_ERROR_STATUS);
};
