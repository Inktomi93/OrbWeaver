// foundation/observability/middleware — the per-request Hono middleware. Assigns/echoes X-Request-Id
// (charset-guarded), opens the request-root tracing span (the parent for every downstream span), binds the
// request-scoped logger, and logs one structured `request` line + records the request ring. Mounted by
// `entry/app` (transport/entry reads foundation DOWN). Skips /api/_debug/* so introspection traffic does
// not evict real traces.

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { MiddlewareHandler } from "hono";
import { getLog, getRequestUserId, recordRequest, runInRequest } from "./logger";
import { withRequestSpan } from "./tracing";

const DEBUG_PREFIX = "/api/_debug";

// Caps reuse-from-header to 128 chars + a conservative charset so a client can't inject log-line content
// or terminal escapes via a malicious X-Request-Id. A 36-char UUID fits; Caddy's hex/short-id also pass.
// Mismatch → a fresh UUID is generated. (core/Tier-2-Foundation.md esoteric #11.)
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.\-:]{1,128}$/u;

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
    const path = c.req.path;
    const method = c.req.method;
    // The introspection API skips both the log line AND the trace root — without it every /api/_debug/* GET
    // would land in the trace ring and evict an earlier real trace while the operator browses them.
    if (path.startsWith(DEBUG_PREFIX)) {
      await next();
      return;
    }

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
