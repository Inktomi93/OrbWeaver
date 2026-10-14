import type { ScheduleTimeout } from "#contract";

export const realScheduleTimeout: ScheduleTimeout = (callback, ms) => {
  const timer = setTimeout(callback, ms);
  return () => clearTimeout(timer);
};

/** Wait in the same timer scope as the request; cancellation removes both the timer and signal listener. */
export function waitForTimeout(ms: number, signal: AbortSignal, scheduleTimeout: ScheduleTimeout = realScheduleTimeout): Promise<void> {
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
