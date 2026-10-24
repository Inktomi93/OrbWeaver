// pino (multistream: stdout + the in-process ring) + the bounded ring buffers behind /api/_debug + the
// AsyncLocalStorage request scope + securityEvent. `getLog()`/`logger` is the only sanctioned output.
// Doctrine: logs are metadata — RP content lives in the DB, never a log line.
//
// ASSUMES(single-replica): the log + request rings are module-scope, per-process. An admin browsing
// /api/_debug on a multi-replica deploy sees only the replica they hit.

import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";
import { Writable } from "node:stream";
import type { LogLevel } from "@orb/contracts/settings";
import { createBoundedRing } from "@orb/kit/bounded-ring";
import type { Handle, UserId } from "@orb/kit/ids";
import pino from "pino";
import { env } from "#foundation/env";
import type { Logger, RequestRecord } from "./contract/logging.ts";

export type { Logger, RequestRecord } from "./contract/logging.ts";

const LOG_RING_CAPACITY = 2000;
const REQUEST_RING_CAPACITY = 500;
const LOWEST_LOG_LEVEL = "trace" satisfies LogLevel;

/** The pino stream-attached ring of raw serialized log lines — strings in, parsed lazily on query (cheap
 *  writes; the parse cost only happens when someone curls /api/_debug/logs). The debug surface reads it.
 *  ASSUMES(single-replica). */
export const logRing = createBoundedRing<string>(LOG_RING_CAPACITY);
const requestRing = createBoundedRing<RequestRecord>(REQUEST_RING_CAPACITY);

export function recordRequest(record: RequestRecord): void {
  requestRing.push(record);
}

export function recentRequests(limit: number): RequestRecord[] {
  return requestRing.recent(limit);
}

// A stream that captures each already-serialized JSON line into the ring. No parsing here — cheap on the
// hot path.
const ringStream = new Writable({
  write(chunk: Buffer, _encoding, callback): void {
    logRing.push(chunk.toString("utf8").trimEnd());
    callback();
  },
});

/** The serializers every log line runs: an `err` field is copied enumerable key by enumerable key. */
export const logSerializers: { readonly err: typeof pino.stdSerializers.err } = { err: pino.stdSerializers.err };

/** A root's logger at `level`. Every root's logger writes the same process stdout and log ring. */
export function createLogger(level: LogLevel): Logger {
  return pino(
    {
      level,
      // Emit the level as its string label ("warn"), not pino's numeric 40 — greppable in any aggregator.
      formatters: { level: (label) => ({ level: label }) },
      timestamp: pino.stdTimeFunctions.isoTime,
      serializers: logSerializers,
      // Auth/secrets only — RP bodies are never logged. Top-level keys + one-level *.x wildcards: pino
      // redact is not recursive, so a bare "apiKey" misses a nested { credential: { apiKey } }.
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "authorization",
          "token",
          "authToken",
          "apiKey",
          "password",
          "*.authorization",
          "*.token",
          "*.authToken",
          "*.apiKey",
          "*.password",
          "*.ciphertext",
          "*.cookie",
        ],
        censor: "[redacted]",
      },
    },
    // Destinations admit every level so `logger.level` is the one gate: a fixed destination level (pino's
    // default is `info`) would drop lines after a runtime `AppSettings.logLevel` raise past the boot level.
    pino.multistream(
      [
        { level: LOWEST_LOG_LEVEL, stream: process.stdout },
        { level: LOWEST_LOG_LEVEL, stream: ringStream },
      ],
      { dedupe: false },
    ),
  );
}

/** The process logger that un-migrated sites still import; a root hands its own from {@link createLogger}.
 *  Transitional: item 1271's last leg deletes it with this module's process-env read. */
export const logger: Logger = createLogger(env.LOG_LEVEL);

interface RequestContext {
  requestId: string;
  log: Logger;
  /** Set once auth resolves (see `bindRequestUser`); read by the request-ring recorder. */
  userId?: UserId;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Run `fn` with a request-scoped child of the root's logger, bound to this request id. */
export function runInRequest<T>(base: Logger, requestId: string, fn: () => T): T {
  return requestContext.run({ requestId, log: base.child({ requestId }) }, fn);
}

/** The current request's logger (carries requestId + — once bound — userId/handle), else `base`, the
 *  caller's root logger. An omitted `base` falls back to the process logger until item 1271 removes it. */
export function getLog(base: Logger = logger): Logger {
  return requestContext.getStore()?.log ?? base;
}

/** Attach the resolved caller to the current request scope; afterwards every line carries `userId`/`handle`.
 *  No-op outside a request scope. */
export function bindRequestUser(userId: UserId, handle?: Handle): void {
  const store = requestContext.getStore();
  if (store === undefined) {
    return;
  }
  store.userId = userId;
  store.log = store.log.child(handle === undefined ? { userId } : { userId, handle });
}

/** The current request's resolved caller id, if auth has bound it — for the request-ring record. */
export function getRequestUserId(): UserId | undefined {
  return requestContext.getStore()?.userId;
}

/** Security-relevant events. One consistently-tagged pino line so the whole security trail is greppable
 *  as `security:true` and filterable by `event`. Emitted at warn (rejections/blocks, not errors). */
export function securityEvent(event: string, fields: Record<string, unknown> = {}, message?: string, base?: Logger): void {
  getLog(base).warn({ security: true, event, ...fields }, message ?? `security: ${event}`);
}

// An IdP `groups` claim is EXTERNAL, unvalidated text arriving on the unauthenticated login path, so what
// reaches a log line is bounded on both axes — a misconfigured (or hostile) property mapping must not be
// able to flood the ring buffer or the aggregator with one login.
const LOG_GROUP_NAMES_MAX = 32;
const LOG_GROUP_NAME_CHARS_MAX = 64;

/**
 * THE ONE rendering of an IdP `groups` claim into log bindings, shared by the OIDC claim mapper (entry) and
 * the SSO upsert (`domain/sessions`) so the two can never drift: `groups` = the bounded group NAMES,
 * `groupCount` = the true pre-bound size (so `groups.length < groupCount` is the tell that it was capped).
 *
 * Group NAMES are exactly the observable an operator needs — which group granted `admin`, which one failed
 * the `OIDC_ALLOWED_GROUPS` gate — and are org structure, not credentials. The ID token, the raw claim
 * object, and every other claim stay OUT: this takes the already-normalized name list and nothing else.
 */
export function groupsLogFields(groups: readonly string[]): { readonly groups: string[]; readonly groupCount: number } {
  return {
    groups: groups.slice(0, LOG_GROUP_NAMES_MAX).map((name) => name.slice(0, LOG_GROUP_NAME_CHARS_MAX)),
    groupCount: groups.length,
  };
}
