// Unit test: the workloads-worker DRIVER. Mocks the injected engine ops (the "fake at the edges" doctrine,
// testing §3) + a frozen clock, so the claim/dispatch decisions are asserted with zero db or wall time. The
// tick cores (`claimAndRunNext`/`reapOnce`) are tested directly; the loop tests cover boot-reap + abort + the
// LANE INDEPENDENCE that the two-lane worker exists for.

import type { WorkloadLane } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import type { WorkloadContributions, WorkloadRunnableRow, WorkloadRunnerDeps } from "@orb/server/domain/workloads";
import { describe, vi } from "vitest";
import { claimAndRunNext, reapOnce, startWorkloadsWorker } from "../../../../packages/server/src/transport/jobs/workloads-worker.ts";
import { expect, test } from "../../../support/fixtures";
import { makeRow, makeWorkerDeps, T0 } from "./_support.ts";

describe("workloads-worker claim tick", () => {
  test("claims its lane's queue head and runs it through the injected engine op", async () => {
    const row = makeRow({ status: "queued" });
    const deps = makeWorkerDeps({
      nextRunnable: vi.fn(() => Promise.resolve(row)),
      // After dispatch the row is terminal — no back-off.
      load: vi.fn(() => Promise.resolve(makeRow({ status: "succeeded" }))),
    });

    const outcome = await claimAndRunNext(deps, "sweep");

    // The LANE is threaded into the poll — each loop sees only its own queue.
    expect(deps.nextRunnable).toHaveBeenCalledWith(deps.runnerDeps.db, deps.runnerDeps.contributions, T0, "sweep");
    expect(deps.run).toHaveBeenCalledTimes(1);
    // The driver threads its OWN runnerDeps + signal into the run (so a SIGTERM aborts the in-flight row).
    expect(deps.run).toHaveBeenCalledWith(deps.runnerDeps, row, deps.signal);
    expect(outcome).toEqual({ ran: true, backOff: false });
  });

  test("an empty queue is a no-op (run not called)", async () => {
    const deps = makeWorkerDeps({ nextRunnable: vi.fn(() => Promise.resolve(null)) });

    const outcome = await claimAndRunNext(deps, "interactive");

    expect(deps.run).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ran: false, backOff: false });
  });

  test("a failed poll query backs off without running", async () => {
    const deps = makeWorkerDeps({
      nextRunnable: vi.fn(() => Promise.reject(new Error("db down"))),
    });

    const outcome = await claimAndRunNext(deps, "sweep");

    expect(deps.run).not.toHaveBeenCalled();
    expect(outcome).toEqual({ ran: false, backOff: true });
  });

  test("a row STILL 'queued' after dispatch backs off a full poll period (anti-hot-loop)", async () => {
    const row = makeRow({ status: "queued" });
    const deps = makeWorkerDeps({
      nextRunnable: vi.fn(() => Promise.resolve(row)),
      load: vi.fn(() => Promise.resolve(makeRow({ status: "queued" }))),
    });

    const outcome = await claimAndRunNext(deps, "sweep");

    expect(outcome).toEqual({ ran: true, backOff: true });
  });

  test("an engine throw is caught — the row dispatched, the loop survives", async () => {
    const row = makeRow({ status: "queued" });
    const deps = makeWorkerDeps({
      nextRunnable: vi.fn(() => Promise.resolve(row)),
      run: vi.fn(() => Promise.reject(new Error("engine bookkeeping blew up"))),
      load: vi.fn(() => Promise.resolve(makeRow({ status: "failed" }))),
    });

    // Must not throw — the engine error is swallowed (logged) so the loop keeps polling.
    const outcome = await claimAndRunNext(deps, "sweep");
    expect(outcome.ran).toBe(true);
  });
});

describe("workloads-worker reap tick", () => {
  test("sweeps orphans through the injected reap op with the injected clock", async () => {
    const reap = vi.fn(() => Promise.resolve(3));
    const deps = makeWorkerDeps({ reap });

    const reaped = await reapOnce(deps);

    expect(reap).toHaveBeenCalledWith({ db: deps.runnerDeps.db, contributions: deps.runnerDeps.contributions, now: T0 });
    expect(reaped).toBe(3);
  });

  test("a reap failure is swallowed (returns 0 — never takes the loop down)", async () => {
    const deps = makeWorkerDeps({ reap: vi.fn(() => Promise.reject(new Error("blip"))) });
    await expect(reapOnce(deps)).resolves.toBe(0);
  });
});

describe("workloads-worker loop", () => {
  test("boot-reaps, claims one row per lane, then exits when the signal aborts mid-run", async () => {
    const controller = new AbortController();
    const reap = vi.fn(() => Promise.resolve(0));
    const runningLanes: WorkloadLane[] = [];
    // Each lane's run records itself and aborts — the post-run `aborted` check then breaks both loops.
    const run = vi.fn((_deps: WorkloadRunnerDeps, row: WorkloadRunnableRow) => {
      runningLanes.push(row.lane);
      controller.abort();
      return Promise.resolve();
    });
    const nextRunnable = vi.fn((_db: Db, _contributions: WorkloadContributions, _now: number, lane: WorkloadLane) => Promise.resolve(makeRow({ lane })));
    const clearReap = vi.fn();
    const unsubscribe = vi.fn();

    const deps = makeWorkerDeps({
      signal: controller.signal,
      reap,
      run,
      nextRunnable,
      load: vi.fn(() => Promise.resolve(makeRow({ status: "succeeded" }))),
      subscribeWake: vi.fn(() => unsubscribe),
      scheduleInterval: vi.fn(() => clearReap),
    });

    await startWorkloadsWorker(deps);

    expect(reap).toHaveBeenCalledTimes(1);
    // BOTH lanes ran their claim — the loops are independent, not one global queue.
    expect(runningLanes.toSorted((a, b) => a.localeCompare(b))).toEqual(["interactive", "sweep"]);
    // The reap tick + the wake subscription are shared across lanes (one each), and both are torn down.
    expect(deps.scheduleInterval).toHaveBeenCalledTimes(1);
    expect(clearReap).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("an already-aborted signal does no work beyond the boot reap", async () => {
    const controller = new AbortController();
    controller.abort();
    const nextRunnable = vi.fn(() => Promise.resolve(makeRow()));
    const deps = makeWorkerDeps({ signal: controller.signal, nextRunnable });

    await startWorkloadsWorker(deps);

    expect(nextRunnable).not.toHaveBeenCalled();
  });

  // THE HEAD-BLOCKING REGRESSION (report §2): before the lane split, ONE global loop ran rows to completion
  // in sequence, so a 20-minute `import-st` delayed a user's `databank-ingest` by 20 minutes — "build never
  // blocks" blocked anyway. Here the sweep lane is occupied BY CONSTRUCTION (its run never settles) and the
  // interactive row must still claim, run and finish.
  test("an interactive row runs to completion WHILE the sweep lane is occupied by a long run", async () => {
    const controller = new AbortController();
    const sweepStarted = Promise.withResolvers<void>();
    // The sweep run stays pending until the test resolves this gate — the "occupied lane" by construction.
    const sweepGate = Promise.withResolvers<void>();
    const interactiveFinished: WorkloadLane[] = [];

    const run = vi.fn((_deps: WorkloadRunnerDeps, row: WorkloadRunnableRow) => {
      if (row.lane === "sweep") {
        sweepStarted.resolve();
        return sweepGate.promise;
      }
      interactiveFinished.push(row.lane);
      controller.abort(); // the interactive work is done — shut the worker down
      return Promise.resolve();
    });

    const deps = makeWorkerDeps({
      signal: controller.signal,
      run,
      nextRunnable: vi.fn((_db: Db, _contributions: WorkloadContributions, _now: number, lane: WorkloadLane) => Promise.resolve(makeRow({ lane }))),
      load: vi.fn(() => Promise.resolve(makeRow({ status: "succeeded" }))),
    });

    const loop = startWorkloadsWorker(deps);
    await sweepStarted.promise;
    // The sweep run is STILL pending here; the interactive lane completed anyway.
    await vi.waitFor(() => {
      expect(interactiveFinished).toEqual(["interactive"]);
    });
    sweepGate.resolve();
    await loop;
  });
});
