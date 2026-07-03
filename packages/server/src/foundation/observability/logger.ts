// foundation/observability/logger — pino (multistream: stdout + the in-process ring) + the bounded ring
// buffers behind /api/_debug + the AsyncLocalStorage request scope + `securityEvent`. Read DOWN by every
// tier; `getLog()`/`logger` is the ONLY sanctioned output (the `noConsole` total ban goes live with this
// file). Doctrine: logs are METADATA — RP content lives in the DB (never a log line — core/Tier-2-Foundation.md
// esoteric #12).
//
// ASSUMES(single-replica): the log + request rings are module-scope, per-process (core/Tier-2-Foundation.md
// esoteric #5). An admin browsing /api/_debug on a multi-replica deploy sees only the replica they hit;
// the rings are the seam to externalize if that is ever reversed.

import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";
import { Writable } from "node:stream";
import pino from "pino";
import { env } from "#foundation/env";

// pino v10 exports `Logger` as a member of the `pino` namespace (not a top-level named export), so it is
// referenced as `pino.Logger`. A local, non-exported alias keeps the rest of the file readable.
type Logger = pino.Logger;

const LOG_RING_CAPACITY = 2000;
const REQUEST_RING_CAPACITY = 500;

/** Circular buffer of raw serialized log lines. Strings are stored and parsed lazily on query (cheap
 *  writes; the parse cost only happens when someone curls /api/_debug/logs). */
class LineRing {
  private readonly buf: (string | undefined)[];
  private readonly cap: number;
  private head = 0;
  private size = 0;

  constructor(cap: number) {
    this.cap = cap;
    this.buf = new Array<string | undefined>(cap);
  }

  push(line: string): void {
    this.buf[this.head] = line;
    this.head = (this.head + 1) % this.cap;
    this.size = Math.min(this.size + 1, this.cap);
  }

  /** Most-recent-first. */
  recent(limit: number): string[] {
    const out: string[] = [];
    const n = Math.min(limit, this.size);
    for (let i = 1; i <= n; i += 1) {
      const line = this.buf[(this.head - i + this.cap) % this.cap];
      if (line !== undefined) {
        out.push(line);
      }
    }
    return out;
  }
}

/** One entry in the request ring; consumed by `recordRequest`/`recentRequests` + the debug surface. */
export interface RequestRecord {
  id: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at: number;
  /** The resolved caller (bound once auth resolves — see `bindRequestUser`). Absent on unauthenticated
   *  requests; lets the debug request browser attribute + filter by user on a multi-user deploy. */
  userId?: string;
}

class RequestRing {
  private readonly buf: (RequestRecord | undefined)[];
  private readonly cap: number;
  private head = 0;
  private size = 0;

  constructor(cap: number) {
    this.cap = cap;
    this.buf = new Array<RequestRecord | undefined>(cap);
  }

  push(record: RequestRecord): void {
    this.buf[this.head] = record;
    this.head = (this.head + 1) % this.cap;
    this.size = Math.min(this.size + 1, this.cap);
  }

  recent(limit: number): RequestRecord[] {
    const out: RequestRecord[] = [];
    const n = Math.min(limit, this.size);
    for (let i = 1; i <= n; i += 1) {
      const record = this.buf[(this.head - i + this.cap) % this.cap];
      if (record !== undefined) {
        out.push(record);
      }
    }
    return out;
  }
}

/** The pino stream-attached ring; the debug surface reads it. ASSUMES(single-replica). */
export const logRing = new LineRing(LOG_RING_CAPACITY);
const requestRing = new RequestRing(REQUEST_RING_CAPACITY);

export function recordRequest(record: RequestRecord): void {
  requestRing.push(record);
}

export function recentRequests(limit: number): RequestRecord[] {
  return requestRing.recent(limit);
}

// A stream that captures each already-serialized JSON line into the ring. No parsing here — that is the
// whole point (cheap on the hot path); the line is already serialized on the main thread.
const ringStream = new Writable({
  write(chunk: Buffer, _encoding, callback): void {
    logRing.push(chunk.toString("utf8").trimEnd());
    callback();
  },
});

export const logger: Logger = pino(
  {
    level: env.LOG_LEVEL,
    // Emit the level as its string label ("warn"), not pino's numeric 40 — greppable + readable in any
    // viewer/aggregator without a level map. pino-pretty renders both; this is for the raw JSON.
    formatters: { level: (label) => ({ level: label }) },
    // ISO-8601 timestamps in the JSON (aggregator-friendly + human-readable raw) over epoch ms.
    timestamp: pino.stdTimeFunctions.isoTime,
    // An Error logged under `err` serializes to { type, message, stack } — full traces, not `{}`.
    serializers: { err: pino.stdSerializers.err },
    // Auth/secrets only — RP bodies are never logged, so there is nothing else to scrub. Top-level keys +
    // one-level `*.x` wildcards: pino redact is NOT recursive, so a bare "apiKey" misses a nested
    // `{ credential: { apiKey } }`. Defense-in-depth (current call sites log ids/source, never plaintext).
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "authorization",
        "token",
        "apiKey",
        "password",
        "*.authorization",
        "*.token",
        "*.apiKey",
        "*.password",
        "*.ciphertext",
        "*.cookie",
      ],
      censor: "[redacted]",
    },
  },
  // Each multistream destination needs its OWN level — without it pino.multistream defaults streams to
  // `info` and silently DROPS debug logs even when the logger level is `debug`, making every per-op
  // getLog().debug line unreachable (stdout AND the ring). Tie both to LOG_LEVEL; dedupe:false → a log
  // goes to every stream at/above its level (core/Tier-2-Foundation.md esoteric #7).
  pino.multistream(
    [
      { level: env.LOG_LEVEL, stream: process.stdout },
      { level: env.LOG_LEVEL, stream: ringStream },
    ],
    { dedupe: false },
  ),
);

interface RequestContext {
  requestId: string;
  log: Logger;
  /** Set once auth resolves (see `bindRequestUser`); read by the request-ring recorder. */
  userId?: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with a request-scoped child logger bound to this request id. */
export function runInRequest<T>(requestId: string, fn: () => T): T {
  return requestContext.run({ requestId, log: logger.child({ requestId }) }, fn);
}

/** The current request's logger (carries requestId + — once bound — userId/handle), or the base logger. */
export function getLog(): Logger {
  return requestContext.getStore()?.log ?? logger;
}

/** Attach the resolved caller to the current request scope. Called from the transport context seam the
 *  moment identity is known — afterwards every line in the request carries `userId`/`handle` via the child
 *  bindings. No-op outside a request scope (tests that build a context without `runInRequest`). */
export function bindRequestUser(userId: string, handle?: string): void {
  const store = requestContext.getStore();
  if (store === undefined) {
    return;
  }
  store.userId = userId;
  store.log = store.log.child(handle === undefined ? { userId } : { userId, handle });
}

/** The current request's resolved caller id, if auth has bound it — for the request-ring record. */
export function getRequestUserId(): string | undefined {
  return requestContext.getStore()?.userId;
}

/** Security-relevant events. One consistently-tagged pino line so the whole security trail is greppable as
 *  `security:true` and filterable by `event`. Emitted at warn (rejections/blocks, not errors). The
 *  auth/network/transport seams (SSRF block, rate-limit, CSRF reject, auth fail, JWKS reject) call this.
 *  DELIBERATELY pino-only — for a single-operator deploy the log stream + the ring IS the audit surface. */
export function securityEvent(
  event: string,
  fields: Record<string, unknown> = {},
  message?: string,
): void {
  getLog().warn({ security: true, event, ...fields }, message ?? `security: ${event}`);
}
