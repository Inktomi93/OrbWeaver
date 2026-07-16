// infra/providers/backends/kit/retry — PRE-COMMIT-safe retry for streaming HTTP runners. Retries
// 429/5xx with jittered exponential backoff while it is STILL SAFE — i.e. before any token has streamed to
// the caller. Once `onDelta` has fired once the stream has committed; retrying would replay tokens to the
// UI, so the error is surfaced instead. (The agent-sdk runner has the SDK's own internal retry; the
// stateless HTTP runners did not — this is theirs.)
//
// DETERMINISM (spine/testing §3): the jitter RNG and the `resetsAt`-proximity clock are INJECTED via
// `RetryOptions` (no ambient `Math.random` / `Date.now` on the production path — the same seam tests use).
// `random` defaults to `Math.random`; `now` is optional — omit it and the `resetsAt` shortcut is simply
// skipped (pure exponential backoff), so no raw clock read ever happens here (no-raw-clock).

import { ProviderError } from "../../contract";

const DEFAULT_MAX_ATTEMPTS = 3; // total tries including the first
const DEFAULT_BASE_MS = 500; // first sleep
const DEFAULT_MAX_MS = 8000; // cap on any single sleep
const RESETS_AT_NEAR_MS = 30_000; // honor a rate-limit `resetsAt` only when it's this near
const BACKOFF_FACTOR = 2; // exponential base
const JITTER_SPREAD = 0.4; // ±20% jitter band
const JITTER_CENTER = 0.5; // RNG midpoint (random() in [0,1) → jitter in [0.8, 1.2))

/** Tuning + injected seams for the retry policy. */
export interface RetryOptions {
  /** Total tries including the first. */
  readonly maxAttempts?: number;
  /** First backoff sleep (ms). */
  readonly baseMs?: number;
  /** Cap on any single backoff sleep (ms). */
  readonly maxMs?: number;
  /** Caller-cancel that interrupts the backoff sleep (so Stop during a rate-limit wait is prompt). */
  readonly signal?: AbortSignal;
  /** Injected jitter RNG in `[0, 1)` (default `Math.random`) — deterministic in tests. */
  readonly random?: () => number;
  /** Injected clock (epoch-ms) for the `resetsAt`-proximity shortcut. Omit to skip it (pure backoff). */
  readonly now?: () => number;
}

/**
 * Choose the sleep (ms) before the upcoming retry. When a near (`<= 30s`) rate-limit `resetsAt` is known
 * AND a clock is injected, wait until it; otherwise exponential backoff (`base * 2^(attempt-1)`) with
 * ±20% jitter, capped at `maxMs`.
 */
export function computeBackoffMs(attempt: number, err: ProviderError, opts: RetryOptions = {}): number {
  const baseMs = opts.baseMs ?? DEFAULT_BASE_MS;
  const maxMs = opts.maxMs ?? DEFAULT_MAX_MS;
  if (err.kind === "rate_limit" && err.resetsAt !== undefined && opts.now !== undefined) {
    const wait = err.resetsAt - opts.now();
    if (wait > 0 && wait <= RESETS_AT_NEAR_MS) {
      return Math.min(wait, maxMs);
    }
  }
  const random = opts.random ?? Math.random;
  const exp = baseMs * BACKOFF_FACTOR ** (attempt - 1);
  const jitter = 1 + (random() - JITTER_CENTER) * JITTER_SPREAD;
  return Math.min(Math.max(0, Math.round(exp * jitter)), maxMs);
}

/** Sleep that resolves on whichever fires first: the timer or the abort signal. Throws a
 *  `ProviderError(kind:"aborted")` when the signal interrupts, so the retry loop surfaces it as the turn
 *  error rather than silently waiting out the full backoff. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject): void => {
    if (signal?.aborted === true) {
      reject(new ProviderError({ kind: "aborted", retryable: false, message: "backoff aborted" }));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new ProviderError({ kind: "aborted", retryable: false, message: "backoff aborted" }));
    };
    const timer = setTimeout((): void => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
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
  opts: RetryOptions = {},
): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let committed = false;
    const markCommitted = (): void => {
      committed = true;
    };
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a retry loop is inherently sequential — each attempt must await the prior outcome before deciding whether to retry.
      return await op(markCommitted);
    } catch (raw) {
      lastError = raw;
      const mapped = classify(raw);
      const exhausted = attempt >= maxAttempts;
      // Can't retry once a delta streamed (replay duplicates tokens); non-retryable kinds also bail.
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- FALSE POSITIVE: the typed-lint checker over-narrows `committed` to the `false` literal inside this `catch` (it can't see across the `await op(markCommitted)` that a real runner uses to mutate it synchronously mid-stream before throwing). Confirmed a real runner calls `markCommitted()` then throws in the same `op` call — this guard is load-bearing (prevents a retry from replaying already-streamed tokens to the caller).
      if (committed || !mapped.retryable || exhausted) {
        throw raw;
      }
      await abortableSleep(computeBackoffMs(attempt, mapped, opts), opts.signal);
    }
  }
  // Unreachable for maxAttempts >= 1 (the final attempt returns or throws); satisfies the return type.
  throw lastError;
}
