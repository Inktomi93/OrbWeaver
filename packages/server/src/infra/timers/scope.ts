import type { ScheduleOp, TimerScheduler } from "@orb/kit/time";
import type { ScopedTimers } from "./contract/scope.ts";

export const systemTimers: TimerScheduler = {
  timeout: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    return () => clearTimeout(handle);
  },
  timeoutUnref: (callback, ms) => {
    const handle = setTimeout(callback, ms);
    handle.unref();
    return () => clearTimeout(handle);
  },
  interval: (callback, ms) => {
    const handle = setInterval(callback, ms);
    return () => clearInterval(handle);
  },
};

export function createScopedTimers(execution: TimerScheduler): ScopedTimers {
  const cancellations = new Set<() => void>();
  let disposed = false;
  const arm = (schedule: ScheduleOp, callback: () => void, ms: number, repeating: boolean): (() => void) => {
    if (disposed) {
      throw new Error("cannot arm a disposed timer scope");
    }
    const cancel = (): void => {
      cancellations.delete(cancel);
      cancelExecution();
    };
    const cancelExecution = schedule(() => {
      if (!repeating) {
        cancellations.delete(cancel);
      }
      callback();
    }, ms);
    cancellations.add(cancel);
    return cancel;
  };
  return {
    timeout: (callback, ms) => arm((fn, delay) => execution.timeout(fn, delay), callback, ms, false),
    timeoutUnref: (callback, ms) => arm((fn, delay) => execution.timeoutUnref(fn, delay), callback, ms, false),
    interval: (callback, ms) => arm((fn, delay) => execution.interval(fn, delay), callback, ms, true),
    [Symbol.dispose]: (): void => {
      disposed = true;
      using cleanup = new DisposableStack();
      for (const cancel of [...cancellations].toReversed()) {
        cleanup.defer(cancel);
      }
    },
  };
}

/** Wait on an injected timer; cancellation tears down the timer and its signal listener together. */
export function waitForTimer(ms: number, schedule: ScheduleOp, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    return Promise.reject(signal.reason);
  }
  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      cancel();
      signal?.removeEventListener("abort", onAbort);
      reject(signal?.reason);
    };
    const cancel = schedule(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
