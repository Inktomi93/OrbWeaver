import { PluginHostBusyError, WarmRuntimePool } from "../../../../packages/server/src/infra/plugin-host/warm-runtime-pool.ts";
import { expect, test } from "../../../support/fixtures.ts";

interface Target {
  readonly id: string;
}

test("warm pool evicts the least recently used idle runtime without invalidating its logical target", async () => {
  const retired: string[] = [];
  const pool = new WarmRuntimePool<Target>(
    2,
    (target) => {
      retired.push(target.id);
      return Promise.resolve();
    },
    4,
  );
  const first = { id: "first" };
  const second = { id: "second" };
  const third = { id: "third" };

  const firstWarm = await pool.acquire(first);
  firstWarm.ready();
  firstWarm.release();
  const secondWarm = await pool.acquire(second);
  secondWarm.ready();
  secondWarm.release();
  const firstHit = await pool.acquire(first);
  expect(firstHit.cold).toBe(false);
  firstHit.release();

  const thirdWarm = await pool.acquire(third);
  expect(thirdWarm.cold).toBe(true);
  expect(retired).toEqual(["second"]);
  thirdWarm.ready();
  thirdWarm.release();

  const secondAgain = await pool.acquire(second);
  expect(secondAgain.cold).toBe(true);
  secondAgain.ready();
  secondAgain.release();
});

test("all-pinned pressure waits in FIFO order and disable cancels a queued wake", async () => {
  const pool = new WarmRuntimePool<Target>(1, () => Promise.resolve(), 4);
  const active = { id: "active" };
  const disabled = { id: "disabled" };
  const next = { id: "next" };
  const activeLease = await pool.acquire(active);
  activeLease.ready();
  const disabledWake = pool.acquire(disabled);
  const nextWake = pool.acquire(next);

  const disabledError = new Error("disabled while queued");
  pool.remove(disabled, disabledError);
  await expect(disabledWake).rejects.toBe(disabledError);
  activeLease.release();

  const nextLease = await nextWake;
  expect(nextLease.cold).toBe(true);
  nextLease.ready();
  nextLease.release();
});

test("a broker failure rejects queued work and a discarded cold start leaves capacity reusable", async () => {
  const pool = new WarmRuntimePool<Target>(1, () => Promise.resolve(), 4);
  const crashed = { id: "crashed" };
  const retry = { id: "retry" };
  const held = await pool.acquire(crashed);
  held.ready();
  const queued = pool.acquire(crashed);
  const crash = new Error("broker died");
  pool.fail(crashed, crash);
  held.release();
  await expect(queued).rejects.toBe(crash);
  await expect(pool.acquire(crashed)).rejects.toBe(crash);

  const retryLease = await pool.acquire(retry);
  expect(retryLease.cold).toBe(true);
  pool.discard(retry);
  retryLease.release();
  expect((await pool.acquire({ id: "replacement" })).cold).toBe(true);
});

test("removing a pinned logical plugin retires its runtime immediately and makes late release inert", async () => {
  let retired = false;
  let finishRetire!: () => void;
  const retiring = new Promise<void>((resolve) => {
    finishRetire = resolve;
  });
  const target = { id: "disabled" };
  const pool = new WarmRuntimePool<Target>(
    1,
    async () => {
      retired = true;
      await retiring;
    },
    4,
  );
  const lease = await pool.acquire(target);
  lease.ready();
  pool.remove(target, new Error("disabled"));
  expect(retired).toBe(true);

  const replacementPromise = pool.acquire({ id: "replacement" });
  finishRetire();
  const replacement = await replacementPromise;
  expect(replacement.cold).toBe(true);
  replacement.ready();
  lease.release();
  replacement.release();
});

test("a second acquire for one cold target waits until replay publishes the runtime", async () => {
  const target = { id: "sleeping" };
  const pool = new WarmRuntimePool<Target>(1, () => Promise.resolve(), 4);
  const cold = await pool.acquire(target);
  const second = pool.acquire(target);
  let secondSettled = false;
  second
    .then(() => {
      secondSettled = true;
    })
    .catch(() => undefined);

  await Promise.resolve();
  expect(secondSettled).toBe(false);
  cold.ready();
  const warm = await second;
  expect(warm.cold).toBe(false);
  cold.release();
  warm.release();
});

test("pre-broker pressure is bounded and abort removes a queued request before it retains capacity", async () => {
  const pool = new WarmRuntimePool<Target>(1, () => Promise.resolve(), 2);
  const active = await pool.acquire({ id: "active" });
  active.ready();
  try {
    const controller = new AbortController();
    const cancelled = pool.acquire({ id: "cancelled" }, { signal: controller.signal });
    const next = pool.acquire({ id: "next" });

    await expect(pool.acquire({ id: "overflow" })).rejects.toBeInstanceOf(PluginHostBusyError);
    controller.abort();
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });

    active.release();
    const admitted = await next;
    try {
      expect(admitted.cold).toBe(true);
      admitted.ready();
    } finally {
      admitted.release();
    }
  } finally {
    active.release();
  }
});
