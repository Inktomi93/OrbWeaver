// The controlled timer seam: due-time order, interval repeat, cancellation and disposal.
import { expect, test } from "vitest";
import { createFrozenClock } from "./clock.ts";
import { createControlledTimers } from "./timers.ts";

test("timeouts fire in due order, each at its own due instant, and only once the clock reaches them", () => {
  const clock = createFrozenClock(1000);
  using timers = createControlledTimers(clock);
  const fired: string[] = [];
  const at = (label: string) => (): void => void fired.push(`${label}@${clock.now()}`);
  timers.timeout(at("slow"), 30);
  timers.timeout(at("fast"), 10);
  timers.timeout(at("mid"), 20);

  timers.advance(15);
  expect(fired).toEqual(["fast@1010"]);
  expect(clock.now()).toBe(1015);

  timers.advance(15);
  expect(fired).toEqual(["fast@1010", "mid@1020", "slow@1030"]);
  expect(timers.pending()).toBe(0);
});

test("an interval repeats on its period until cancelled, and a timeout armed inside a callback is honored", () => {
  const clock = createFrozenClock(0);
  using timers = createControlledTimers(clock);
  const ticks: number[] = [];
  const stop = timers.interval(() => {
    ticks.push(clock.now());
    if (ticks.length === 1) {
      timers.timeout(() => ticks.push(-clock.now()), 5);
    }
  }, 10);

  timers.advance(35);
  expect(ticks).toEqual([10, -15, 20, 30]);

  stop();
  timers.advance(100);
  expect(ticks).toEqual([10, -15, 20, 30]);
  expect(timers.pending()).toBe(0);
});

test("a cancelled timeout never fires and leaves the armed list", () => {
  using timers = createControlledTimers(createFrozenClock());
  const fired: number[] = [];
  const cancelFirst = timers.timeout(() => fired.push(50), 50);
  timers.timeout(() => fired.push(70), 70);
  expect(timers.armed()).toEqual([50, 70]);

  cancelFirst();
  expect(timers.armed()).toEqual([70]);
  timers.advance(100);
  expect(fired).toEqual([70]);
});

test("disposal drops every pending timer and refuses to arm another", () => {
  using timers = createControlledTimers(createFrozenClock());
  const fired: string[] = [];
  timers.timeout(() => fired.push("timeout"), 5);
  timers.interval(() => fired.push("interval"), 5);
  expect(timers.pending()).toBe(2);

  timers[Symbol.dispose]();
  timers.advance(50);
  expect(fired).toEqual([]);
  expect(timers.pending()).toBe(0);
  expect(() => timers.timeout(() => undefined, 1)).toThrow("disposed");
});
