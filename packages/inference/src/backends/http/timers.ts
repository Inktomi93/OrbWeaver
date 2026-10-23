import type { ScheduleTimeout } from "#src/contract/runtime.ts";

/** Wait in the same timer scope as the request; cancellation removes both the timer and signal listener. */
export function waitForTimeout(ms: number, signal: AbortSignal, scheduleTimeout: ScheduleTimeout): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      cancelTimer();
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    const cancelTimer = scheduleTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
