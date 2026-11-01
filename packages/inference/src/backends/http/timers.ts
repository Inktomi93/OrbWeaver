import { toError } from "@orb/kit/error-message";
import type { ScheduleOp } from "@orb/kit/time";

/** Wait in the same timer scope as the request; cancellation removes both the timer and signal listener. */
export function waitForTimeout(ms: number, signal: AbortSignal, scheduleTimeout: ScheduleOp): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(toError(signal.reason));
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      cancelTimer();
      signal.removeEventListener("abort", onAbort);
      reject(toError(signal.reason));
    };
    const cancelTimer = scheduleTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
