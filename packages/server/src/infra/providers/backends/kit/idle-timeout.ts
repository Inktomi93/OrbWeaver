// infra/providers/backends/kit/idle-timeout — a rolling idle-abort wrapper for streaming HTTP runners.
// Shared (below the sealed backends) so every OpenAI-compatible / OpenRouter runner composes the same
// stall guard without reaching into another strategy.
//
// Why IDLE, not a whole-turn deadline: a single `AbortSignal.timeout(N)` kills the turn N ms after it
// STARTS — so a legitimately long generation that streams for >N ms is aborted mid-stream even though the
// socket is healthy. Resetting the window on every received chunk means only a genuine stall (no bytes for
// the whole window) trips the abort. Pure timers + AbortController — no clock read, so it stays gate-clean.

/** Max time a streaming HTTP call may go WITHOUT a received chunk before the socket is treated as stalled
 *  and aborted. NOT a whole-turn deadline: a healthy long stream resets the window on every chunk. Long
 *  enough to ride out slow first-token latency; short enough that a wedged socket can't pin a slot forever. */
export const IDLE_TIMEOUT_MS = 180_000;

/** The composed idle-abort handle a runner threads through its stream loop. */
export interface IdleAbort {
  /** The composed signal — fires on either the caller's cancel or an idle stall. Pass to `fetch`. */
  readonly signal: AbortSignal;
  /** Call on each received chunk/delta to restart the idle window. */
  readonly reset: () => void;
  /** Call once the turn settles to clear the timer (no dangling timer on a settled turn). */
  readonly dispose: () => void;
}

/**
 * Compose an external (caller-cancel) signal with a ROLLING idle timeout (default {@link IDLE_TIMEOUT_MS}).
 * The window is armed immediately (covers the connection-open / first-token phase, where a stall is just as
 * fatal as one mid-stream); `reset()` restarts it per chunk; `dispose()` clears it on settle. The caller's
 * cancel is folded in so the composed signal fires on either cause.
 */
export function turnAbortSignal(
  external?: AbortSignal,
  idleMs: number = IDLE_TIMEOUT_MS,
): IdleAbort {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let settled = false;

  const dispose = (): void => {
    settled = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const reset = (): void => {
    if (settled || controller.signal.aborted) {
      return;
    }
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout((): void => controller.abort(), idleMs);
  };

  // Fold the caller's cancel into our controller so the composed signal fires on either cause.
  if (external !== undefined) {
    if (external.aborted) {
      controller.abort();
    } else {
      external.addEventListener("abort", (): void => controller.abort(), { once: true });
    }
  }
  // Stop the idle timer once aborted (caller cancel or our own stall trip) so a settled turn leaves no
  // dangling timer.
  controller.signal.addEventListener("abort", dispose, { once: true });

  // Arm the window immediately.
  reset();

  return { signal: controller.signal, reset, dispose };
}
