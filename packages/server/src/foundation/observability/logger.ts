// pino (multistream: stdout + the root's log ring) + the AsyncLocalStorage request scope + securityEvent. A root's
// logger, read through `getLog(base)`, is the only sanctioned output. Logs are metadata: RP content lives in the DB.

import { AsyncLocalStorage } from "node:async_hooks";
import process from "node:process";
import { Writable } from "node:stream";
import type { LogLevel } from "@orb/contracts/settings";
import type { BoundedRing } from "@orb/kit/bounded-ring";
import type { Handle, UserId } from "@orb/kit/ids";
import pino from "pino";
import type { Logger } from "./contract/logging.ts";

export type { Logger, RequestRecord } from "./contract/logging.ts";

const LOWEST_LOG_LEVEL = "trace" satisfies LogLevel;

// Captures each already-serialized JSON line into the ring. No parsing here: the debug reads parse lazily.
function ringStream(ring: BoundedRing<string>): Writable {
  return new Writable({
    write(chunk: Buffer, _encoding, callback): void {
      ring.push(chunk.toString("utf8").trimEnd());
      callback();
    },
  });
}

/** The serializers every log line runs: an `err` field is copied enumerable key by enumerable key. */
export const logSerializers: { readonly err: typeof pino.stdSerializers.err } = { err: pino.stdSerializers.err };

/** A root's logger at `level`, writing process stdout and `ring`, the root's log ring. `null` is a logger no
 *  debug surface reads, such as the plugin broker's or a script's. */
export function createLogger(level: LogLevel, ring: BoundedRing<string> | null): Logger {
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
    pino.multistream([{ level: LOWEST_LOG_LEVEL, stream: process.stdout }, ...(ring === null ? [] : [{ level: LOWEST_LOG_LEVEL, stream: ringStream(ring) }])], {
      dedupe: false,
    }),
  );
}

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
 *  caller's root logger. */
export function getLog(base: Logger): Logger {
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
export function securityEvent(event: string, fields: Record<string, unknown>, message: string | undefined, base: Logger): void {
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
