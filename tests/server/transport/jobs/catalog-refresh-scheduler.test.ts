// Unit test: the catalog-refresh-scheduler DRIVER. Mocks the injected `WorkloadService` (list/start) + a
// frozen clock, asserting the WHEN-to-enqueue decision (no prior row / stale / active / within-cadence) and
// the single-active conflict swallow — zero db, zero wall time (testing §3).

import { DomainConflictError } from "@orb/kit/errors";
import { describe, vi } from "vitest";
import { runCatalogCheck, startCatalogRefreshScheduler } from "../../../../packages/server/src/transport/jobs/catalog-refresh-scheduler.ts";
import { expect, test } from "../../../support/fixtures";
import { makeRow, makeSchedulerDeps, T0 } from "./_support.ts";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

describe("catalog-refresh-scheduler decision", () => {
  test("enqueues a refresh-model-catalog workload when no prior row exists", async () => {
    const deps = makeSchedulerDeps();

    await runCatalogCheck(deps);

    expect(deps.service.start).toHaveBeenCalledTimes(1);
    expect(deps.service.start).toHaveBeenCalledWith({
      input: { kind: "refresh-model-catalog", params: {} },
      caller: null,
      mode: "bulk",
      ownerId: deps.ownerId,
    });
  });

  test("skips when an active (running) row already holds the slot", async () => {
    const list = vi.fn(() => Promise.resolve([makeRow({ status: "running" })]));
    const deps = makeSchedulerDeps({ service: { ...makeSchedulerDeps().service, list } });

    await runCatalogCheck(deps);

    expect(deps.service.start).not.toHaveBeenCalled();
  });

  test("skips when the newest success is still within the 24h refresh cadence", async () => {
    const list = vi.fn(() => Promise.resolve([makeRow({ status: "succeeded", updatedAt: T0 - MS_PER_HOUR })]));
    const deps = makeSchedulerDeps({
      now: () => T0,
      service: { ...makeSchedulerDeps().service, list },
    });

    await runCatalogCheck(deps);

    expect(deps.service.start).not.toHaveBeenCalled();
  });

  test("re-enqueues once a success ages past 24h (fires on the injected clock)", async () => {
    const list = vi.fn(() => Promise.resolve([makeRow({ status: "succeeded", updatedAt: T0 - (MS_PER_DAY + 1) })]));
    const deps = makeSchedulerDeps({
      now: () => T0,
      service: { ...makeSchedulerDeps().service, list },
    });

    await runCatalogCheck(deps);

    expect(deps.service.start).toHaveBeenCalledTimes(1);
  });

  test("a failed row retries after 1h, not the full day", async () => {
    const base = makeSchedulerDeps().service;
    // 90 min after a failure → past the 1h retry cadence.
    const list = vi.fn(() => Promise.resolve([makeRow({ status: "failed", updatedAt: T0 - MS_PER_HOUR - MS_PER_HOUR / 2 })]));
    const deps = makeSchedulerDeps({ now: () => T0, service: { ...base, list } });

    await runCatalogCheck(deps);

    expect(deps.service.start).toHaveBeenCalledTimes(1);
  });

  test("swallows the single-active conflict (another replica/admin beat us — the goal)", async () => {
    const start = vi.fn(() => Promise.reject(new DomainConflictError("kind already active")));
    const deps = makeSchedulerDeps({ service: { ...makeSchedulerDeps().service, start } });

    // Must NOT throw — the conflict is the desired end state.
    await expect(runCatalogCheck(deps)).resolves.toBeUndefined();
  });

  test("a non-conflict start error propagates", async () => {
    const start = vi.fn(() => Promise.reject(new Error("db exploded")));
    const deps = makeSchedulerDeps({ service: { ...makeSchedulerDeps().service, start } });

    await expect(runCatalogCheck(deps)).rejects.toThrow("db exploded");
  });
});

describe("catalog-refresh-scheduler loop", () => {
  test("fires a boot check immediately and arms the recurring interval", async () => {
    const clearInterval = vi.fn();
    const scheduleInterval = vi.fn(() => clearInterval);
    const deps = makeSchedulerDeps({ scheduleInterval });

    const clear = startCatalogRefreshScheduler(deps);
    // The boot check runs the decision async — let it settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(scheduleInterval).toHaveBeenCalledTimes(1);
    expect(deps.service.list).toHaveBeenCalled();
    clear();
    expect(clearInterval).toHaveBeenCalledTimes(1);
  });

  test("a boot-check failure never escapes (logged, the next tick retries)", async () => {
    const list = vi.fn(() => Promise.reject(new Error("list failed")));
    const deps = makeSchedulerDeps({ service: { ...makeSchedulerDeps().service, list } });

    expect(() => startCatalogRefreshScheduler(deps)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
