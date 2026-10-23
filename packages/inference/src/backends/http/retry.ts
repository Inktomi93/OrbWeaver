// infra/providers/backends/http/retry — PRE-COMMIT-safe retry for streaming HTTP runners. Retries
// 429/5xx with jittered exponential backoff while it is STILL SAFE — i.e. before any token has streamed to
// the caller. Once `onDelta` has fired once the stream has committed; retrying would replay tokens to the
// UI, so the error is surfaced instead. (The agent-sdk runner has the SDK's own internal retry; the
// stateless HTTP runners did not — this is theirs.)
//
// DETERMINISM (spine/testing §3): the jitter RNG and the `resetsAt`-proximity clock are INJECTED via
// `RetryOptions` (no ambient `Math.random` / `Date.now` on the production path — the same seam tests use).
// `random` and `scheduleTimeout` are required; `now` is optional — omit it and the `resetsAt` shortcut is simply
// skipped (pure exponential backoff), so no raw clock read ever happens here (no-raw-clock).
//
// TRACE VOCABULARY: every retry decision annotates the active request span (`addSpanEvent`, a no-op when
// there is none) — `provider.retry` {attempt, kind, delayMs} per scheduled backoff, and exactly one
// `provider.retry.abandoned` {attempt, kind, reason} when the loop gives up. Attempts are otherwise
// unreadable from a trace: a succeed-on-attempt-3 turn looks merely slow, and the thrown error cannot
// distinguish "a delta had already streamed" from "attempts exhausted".

/** The span-event seam — the package never imports the tracer; the composition root hands the request span's
 *  `addSpanEvent` in through the backend deps, and a test that passes none gets a silent no-op. */
import type { AddSpanEvent, ScheduleTimeout } from "#contract";
import { ProviderError } from "#contract";
import type { RetryOptions } from "../../contract/http.ts";

const NO_SPAN_EVENT: AddSpanEvent = () => undefined;

const DEFAULT_MAX_ATTEMPTS = 3; // total tries including the first
const DEFAULT_BASE_MS = 500; // first sleep
const DEFAULT_MAX_MS = 8000; // cap on any single sleep
const RESETS_AT_NEAR_MS = 30_000; // honor a rate-limit `resetsAt` only when it's this near
const BACKOFF_FACTOR = 2; // exponential base
const JITTER_SPREAD = 0.4; // ±20% jitter band
const JITTER_CENTER = 0.5; // RNG midpoint (random() in [0,1) → jitter in [0.8, 1.2))

/**
 * Choose the sleep (ms) before the upcoming retry. When a near (`<= 30s`) rate-limit `resetsAt` is known
 * AND a clock is injected, wait until it; otherwise exponential backoff (`base * 2^(attempt-1)`) with
 * ±20% jitter, capped at `maxMs`.
 */
function computeBackoffMs(attempt: number, err: ProviderError, opts: RetryOptions): number {
  const baseMs = opts.baseMs ?? DEFAULT_BASE_MS;
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  if (err.kind === "rate_limit" && err.resetsAt !== undefined && opts.now !== undefined) {
    const wait = err.resetsAt - opts.now();
    if (wait > 0 && wait <= RESETS_AT_NEAR_MS) {
      return Math.min(wait, maxMs);
    }
  }
  const exp = baseMs * BACKOFF_FACTOR ** (attempt - 1);
  const jitter = 1 + (opts.random() - JITTER_CENTER) * JITTER_SPREAD;
  return Math.min(Math.max(0, Math.round(exp * jitter)), maxMs);
}

/** Sleep that resolves on whichever fires first: the timer or the abort signal. Throws a
 *  `ProviderError(kind:"aborted")` when the signal interrupts, so the retry loop surfaces it as the turn
 *  error rather than silently waiting out the full backoff. */
function abortableSleep(ms: number, signal: AbortSignal | undefined, scheduleTimeout: ScheduleTimeout): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject): void => {
    if (signal?.aborted === true) {
      reject(new ProviderError({ kind: "aborted", retryable: false, message: "backoff aborted" }));
      return;
    }
    const onAbort = (): void => {
      cancelTimer();
      reject(new ProviderError({ kind: "aborted", retryable: false, message: "backoff aborted" }));
    };
    const cancelTimer = scheduleTimeout((): void => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Why the loop stopped, in the ORDER the guard tests it — `committed` wins over both, because a delta that
 *  already streamed forecloses a retry no matter how retryable the error or how many attempts remain. */
function abandonReason(committed: boolean, retryable: boolean): string {
  if (committed) {
    return "committed";
  }
  return retryable ? "exhausted" : "non-retryable";
}

/**
 * Run an async op with pre-first-delta retry. The op signals "a delta streamed" via the `markCommitted()`
 * it receives; once committed, no further retry happens (a replay would duplicate tokens). `classify` turns
 * a raw thrown value into a {@link ProviderError} so the policy can read `retryable` + `resetsAt`. The
 * ORIGINAL error is re-thrown (the classification is only for the policy decision).
 */
export async function runWithPreCommitRetry<T>(
  op: (markCommitted: () => void) => Promise<T>,
  classify: (err: unknown) => ProviderError,
  opts: RetryOptions,
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const addSpanEvent = opts.addSpanEvent ?? NO_SPAN_EVENT;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    // A property of an object, not a `let`: the checker narrows a `let` to `false` inside the catch, but `op`
    // flips this flag mid-stream before it throws.
    const stream = { committed: false };
    const markCommitted = (): void => {
      stream.committed = true;
    };
    try {
      return await op(markCommitted);
    } catch (raw) {
      lastError = raw;
      const mapped = classify(raw);
      const exhausted = attempt >= maxAttempts;
      // Can't retry once a delta streamed (replay duplicates tokens); non-retryable kinds also bail.
      if (stream.committed || !mapped.retryable || exhausted) {
        // WHY the loop stopped is not recoverable from the thrown error: "a delta already streamed" and
        // "three attempts burned" surface as the same provider failure at the caller. The span carries it.
        addSpanEvent("provider.retry.abandoned", { attempt, kind: mapped.kind, reason: abandonReason(stream.committed, mapped.retryable) });
        throw raw;
      }
      const delayMs = computeBackoffMs(attempt, mapped, opts);
      // The retries are INVISIBLE otherwise: a run that succeeds on attempt 3 reports a clean span that is
      // simply (backoff + 3 round-trips) slow, with nothing on the timeline naming the two 429s underneath.
      addSpanEvent("provider.retry", { attempt, kind: mapped.kind, delayMs });
      await abortableSleep(delayMs, opts.signal, opts.scheduleTimeout);
    }
  }
  // Unreachable for maxAttempts >= 1 (the final attempt returns or throws); satisfies the return type.
  throw lastError;
}

export type { RetryOptions } from "../../contract/http.ts";
