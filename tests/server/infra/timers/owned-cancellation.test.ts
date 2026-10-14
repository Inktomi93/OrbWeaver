import type { TimerScheduler } from "@orb/kit/time";
import { createScopedTimers } from "@orb/server/infra/timers";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("a raw clear failure still attempts every owned timer cancellation and preserves the failure", async () => {
  const failure = new Error("first raw timer clear failed");
  const pending = new Set<number>();
  const attempts: number[] = [];
  let nextId = 0;
  const arm = (): (() => void) => {
    const id = nextId++;
    pending.add(id);
    return (): void => {
      attempts.push(id);
      pending.delete(id);
      if (id === 0) {
        throw failure;
      }
    };
  };
  const execution: TimerScheduler = { timeout: arm, timeoutUnref: arm, interval: arm };
  using scope = createScopedTimers(execution);
  scope.timeout(() => undefined, 10);
  scope.interval(() => undefined, 20);
  await expect(Promise.resolve().then(() => scope[Symbol.dispose]())).rejects.toBe(failure);
  expect(attempts).toEqual([0, 1]);
  expect([...pending]).toEqual([]);
  expect(() => scope.timeout(() => undefined, 1)).toThrow("disposed timer scope");
});

test("ordinary cancellation clears all handles in arm order and permanently refuses rearming", () => {
  const attempts: number[] = [];
  const arm = (): (() => void) => {
    const id = attempts.length;
    attempts.push(id);
    return (): void => {
      attempts.push(id);
    };
  };
  const execution: TimerScheduler = { timeout: arm, timeoutUnref: arm, interval: arm };
  using scope = createScopedTimers(execution);
  scope.timeout(() => undefined, 10);
  scope.interval(() => undefined, 20);
  expect(() => scope[Symbol.dispose]()).not.toThrow();
  expect(attempts).toEqual([0, 1, 0, 1]);
  expect(() => scope.interval(() => undefined, 1)).toThrow("disposed timer scope");
});
