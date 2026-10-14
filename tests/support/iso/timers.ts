import type { TimerScheduler } from "@orb/kit/time";
import type { Clock } from "./clock.ts";

interface PendingTimer {
  readonly callback: () => void;
  readonly repeatMs: number | null;
  dueAt: number;
}

export interface ControlledTimers extends TimerScheduler, Disposable {
  readonly advance: (ms: number) => void;
  readonly pending: () => number;
}

const MIN_INTERVAL_MS = 1;

export function createControlledTimers(clock: Clock): ControlledTimers {
  const pending = new Map<number, PendingTimer>();
  let nextId = 0;
  let disposed = false;
  const arm = (callback: () => void, ms: number, repeatMs: number | null): (() => void) => {
    if (disposed) {
      throw new Error("cannot arm a disposed timer scheduler");
    }
    const id = nextId++;
    pending.set(id, { callback, repeatMs, dueAt: clock.now() + ms });
    return () => {
      pending.delete(id);
    };
  };
  return {
    timeout: (callback, ms) => arm(callback, ms, null),
    timeoutUnref: (callback, ms) => arm(callback, ms, null),
    interval: (callback, ms) => arm(callback, Math.max(MIN_INTERVAL_MS, ms), Math.max(MIN_INTERVAL_MS, ms)),
    pending: () => pending.size,
    advance: (ms): void => {
      const until = clock.now() + ms;
      for (;;) {
        const next = [...pending.entries()].filter(([, candidate]) => candidate.dueAt <= until).toSorted((a, b) => a[1].dueAt - b[1].dueAt)[0];
        if (next === undefined) {
          break;
        }
        const [id, timer] = next;
        clock.advance(timer.dueAt - clock.now());
        if (timer.repeatMs === null) {
          pending.delete(id);
        } else {
          timer.dueAt += timer.repeatMs;
        }
        timer.callback();
      }
      clock.advance(until - clock.now());
    },
    [Symbol.dispose]: (): void => {
      disposed = true;
      pending.clear();
    },
  };
}
