// @orb-waive-file test-determinism(vi.useFakeTimers): legacy fake-timers usage not yet migrated to the frozen-clock composition seam; ends when this test adopts tests/support/clock.ts
// Engine test: runWorkload — the per-row state machine. Pins the success lifecycle (claim → succeeded +
// result + bus events), failure (→ failed + the PD-113 WORKLOAD_FAILED audit through the injected op),
// the claim-loser early-return, the cancelling→cancelled PIN (an aborted run that returned normally), and
// the reaper-vs-zombie guard (a row reaped mid-run is not resurrected). Timers are disabled
// (makeRunnerDeps `*Ms: 0`) so the run is synchronous + deterministic.
//
// The dispatched body is a TEST DOUBLE swapped into the registry (`contributionsWith`), never an owning
// domain's real contribution: this file tests the STATE MACHINE, and each domain's body is pinned at its own
// mirror. That also keeps this file stable as kinds re-home.

import type { WorkloadProgress } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { describe, vi } from "vitest";
import type { WorkloadContribution } from "../../../../../packages/server/src/domain/workloads/contract/contribution.ts";
import type { WorkloadRunnerDeps } from "../../../../../packages/server/src/domain/workloads/contract/service.ts";
import { getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { reapOrphanedWorkloads } from "../../../../../packages/server/src/domain/workloads/engine/reaper.ts";
import { runWorkload } from "../../../../../packages/server/src/domain/workloads/engine/runner.ts";
import { loadWorkload, loadWorkloadStatus, markTerminal } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { contributionsWith, fakeContributions, loadRunnableWorkload, makeRunnerDeps, seedWorkloadRow, T0 } from "../_support.ts";

// The row read path narrows params against the contribution registry.
const CONTRIBUTIONS = fakeContributions();

// The kind every case here dispatches: a real registered kind (so the row is valid + the read path narrows
// it) whose body this file replaces wholesale.
const KIND = "reconcile-world-state";

/** The run body's exact shape for this kind — the type a swapped-in double is written against. */
type RunBody = WorkloadContribution<typeof KIND>["run"];

const sig = (): AbortSignal => new AbortController().signal;

/** Fail one numbered UPDATE while delegating every other query to the real DB. The runner's first UPDATE is
 * the claim, the second is the report heartbeat, and the third is terminalization. */
function failUpdate(db: Db, failAt: number, error: Error, onUpdate: (ordinal: number) => void): Db {
  let ordinal = 0;
  return new Proxy(db, {
    get: (target, property, receiver): unknown => {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (property !== "update" || typeof value !== "function") {
        return value;
      }
      return (table: unknown): unknown => {
        ordinal += 1;
        onUpdate(ordinal);
        if (ordinal === failAt) {
          return { set: () => ({ where: () => Promise.reject(error) }) };
        }
        return Reflect.apply(value as (...args: readonly unknown[]) => unknown, target, [table]);
      };
    },
  }) as Db;
}

describe("runWorkload", () => {
  test("claims, runs, stores the result, and emits started + succeeded", async () => {
    const db = await freshDb();
    const run = vi.fn(async () => ({ deferred: true }) as const);
    const id = await seedWorkloadRow(db, { id: "wl_ok", kind: KIND, status: "queued" });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run)), row, sig());
    expect(await loadWorkloadStatus(db, id)).toBe("succeeded");
    expect(run).toHaveBeenCalledTimes(1);
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.result).toEqual({ deferred: true });
    const types = getRecentWorkloadEvents(id).map((e) => e.type);
    expect(types).toContain("started");
    expect(types).toContain("succeeded");
  });

  test("a thrown run body fails the row + emits failed + audits WORKLOAD_FAILED", async () => {
    const db = await freshDb();
    const run = vi.fn(() => Promise.reject(new Error("boom")));
    const audit = vi.fn<WorkloadRunnerDeps["audit"]>(() => Promise.resolve());
    const id = await seedWorkloadRow(db, { id: "wl_fail", kind: KIND, status: "queued" });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run), { audit }), row, sig());
    expect(await loadWorkloadStatus(db, id)).toBe("failed");
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.error).toContain("boom");
    expect(getRecentWorkloadEvents(id).map((e) => e.type)).toContain("failed");
    // PD-113: the terminal runtime failure lands exactly ONE audit through the injected op.
    expect(audit).toHaveBeenCalledExactlyOnceWith(
      {
        actorUserId: row.ownerId,
        action: "WORKLOAD_FAILED",
        entityType: "workload",
        entityId: id,
        metadata: { kind: KIND, error: "boom" },
      },
      T0,
    );
  });

  test("the claim loser returns silently (a non-queued row is not re-run)", async () => {
    const db = await freshDb();
    const run = vi.fn(async () => ({ deferred: true }) as const);
    const id = await seedWorkloadRow(db, { id: "wl_run", kind: KIND, status: "running" });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run)), row, sig());
    expect(run).not.toHaveBeenCalled();
    expect(await loadWorkloadStatus(db, id)).toBe("running");
    expect(getRecentWorkloadEvents(id)).toHaveLength(0);
  });

  test("an aborted run is pinned to cancelled, never succeeded", async () => {
    const db = await freshDb();
    const run = vi.fn(async () => ({ deferred: true }) as const);
    const id = await seedWorkloadRow(db, { id: "wl_cxl", kind: KIND, status: "queued" });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    const ac = new AbortController();
    ac.abort();
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run)), row, ac.signal);
    expect(await loadWorkloadStatus(db, id)).toBe("cancelled");
    const types = getRecentWorkloadEvents(id).map((e) => e.type);
    expect(types).toContain("cancelled");
    expect(types).not.toContain("succeeded");
  });

  test("a row reaped mid-run is not resurrected (zombie guard)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { id: "wl_zmb", kind: KIND, status: "queued" });
    // Simulate a reaper terminalizing the in-flight row WHILE the body is working.
    const run = vi.fn(async () => {
      await markTerminal(db, { id, status: "worker_died", now: T0 });
      return { deferred: true } as const;
    });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run)), row, sig());
    expect(await loadWorkloadStatus(db, id)).toBe("worker_died");
    expect(getRecentWorkloadEvents(id).map((e) => e.type)).not.toContain("succeeded");
  });

  test("a failed lease write aborts and OWNS the contribution before terminalizing failed", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { id: "wl_lease_fail", kind: KIND, status: "queued" });
    const release = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const order: string[] = [];
    const run = vi.fn<RunBody>(async (_ctx, _params, report, signal) => {
      report({ message: "starts the lease write" });
      await new Promise<void>((resolve) => {
        const onAbort = (): void => {
          order.push("contribution-aborted");
          aborted.resolve();
          resolve();
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
        }
      });
      await release.promise;
      order.push("contribution-settled");
      return { deferred: true } as const;
    });
    const failedDb = failUpdate(db, 2, new Error("lease write failed"), (ordinal) => {
      if (ordinal === 3) {
        order.push("terminal-write");
      }
    });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    const running = runWorkload(makeRunnerDeps(failedDb, contributionsWith(KIND, run)), row, sig());
    try {
      await aborted.promise;
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(order).not.toContain("terminal-write");
    } finally {
      release.resolve();
    }
    await running;
    expect(order.indexOf("contribution-settled")).toBeLessThan(order.indexOf("terminal-write"));
    expect(await loadWorkloadStatus(db, id)).toBe("failed");
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.error).toContain("lease write failed");
  });
});

// The DURABLE progress snapshot. The in-process replay ring is a 60s live-tail smoother — this column is
// what a client with NO subscription (a reload, a tab opened 20 minutes into an import) actually reads.
describe("runWorkload progress durability", () => {
  test("report() lands the latest snapshot on the ROW, readable with no subscription at all", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { id: "wl_prog", kind: KIND, status: "queued" });
    const seen: (WorkloadProgress | null)[] = [];
    const run = vi.fn<RunBody>(async (_ctx, _params, report) => {
      report({ message: "step one", current: 1, total: 3 });
      // Read the row back MID-RUN through the plain read path — this is the reconnect view.
      seen.push((await loadWorkload(db, CONTRIBUTIONS, id))?.progress ?? null);
      report({ message: "step three", current: 3, total: 3, pct: 100 });
      seen.push((await loadWorkload(db, CONTRIBUTIONS, id))?.progress ?? null);
      return { deferred: true } as const;
    });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run)), row, sig());

    expect(seen[0]).toEqual({ message: "step one", current: 1, total: 3 });
    expect(seen[1]).toEqual({ message: "step three", current: 3, total: 3, pct: 100 });
    // …and it survives the terminal stamp, so a finished row still explains where it got to.
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.progress).toEqual({ message: "step three", current: 3, total: 3, pct: 100 });
  });

  test("a run that never reports leaves progress null (no phantom snapshot)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { id: "wl_quiet", kind: KIND, status: "queued" });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    await runWorkload(
      makeRunnerDeps(
        db,
        contributionsWith(KIND, async () => ({ deferred: true }) as const),
      ),
      row,
      sig(),
    );
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.progress).toBeNull();
  });

  test("the durable write is THROTTLED to the lease cadence — a chatty run writes one snapshot per period", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { id: "wl_chatty", kind: KIND, status: "queued" });
    let clock = T0;
    const run = vi.fn<RunBody>(async (_ctx, _params, report) => {
      // Three reports inside ONE 5s cadence window: only the first reaches the row.
      report({ message: "a" });
      clock += 10;
      report({ message: "b" });
      clock += 10;
      report({ message: "c" });
      expect((await loadWorkload(db, CONTRIBUTIONS, id))?.progress).toEqual({ message: "a" });
      // Past the cadence, the next report writes again (carrying the latest).
      clock += 5000;
      report({ message: "d" });
      expect((await loadWorkload(db, CONTRIBUTIONS, id))?.progress).toEqual({ message: "d" });
      return { deferred: true } as const;
    });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    // heartbeatMs left at its 5s DEFAULT here (the throttle window under test); the cancel poll stays off.
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run), { now: () => clock, cancelPollMs: 0, heartbeatMs: 5000 }), row, sig());
    expect(run).toHaveBeenCalledTimes(1);
  });
});

// #560 — THE STARVATION FENCE. These two are a REGRESSION GUARD, not a defect proof: they pass against the
// pre-#560 engine, and that is the point. The 08-22 long-pass deaths were hypothesised to be a run body's long
// provider call starving the lease tick; the engine's heartbeat is a `setInterval`, so an AWAITED call (which
// is all a provider call is) yields the loop and the timer fires regardless. The hypothesis cost a forensics
// lane, so it is pinned closed here: a run that stays pending far past the reaper's window keeps its lease,
// and the disabled-timer arm proves the assertion can actually fail.
//
// FAKE TIMERS + an injected clock, not wall time: the property is "the lease tick is SCHEDULED, so a pending
// body cannot hold it up", and advancing a fake clock while the body's promise is still unresolved states
// exactly that — deterministically, and without an ambient `Date.now()` the test-determinism gate would
// (correctly) refuse.
describe("runWorkload lease under a slow item", () => {
  const staleMs = 60;
  const inFlightMs = staleMs * 4;

  /** Hold one run pending, advance past the stale window, and report what a sweep at that instant would do. */
  async function reapDuringPendingRun(heartbeatMs: number): Promise<{ reaped: number; status: string | undefined }> {
    const db = await freshDb();
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    const run: RunBody = async () => {
      started.resolve();
      await gate.promise;
      return { deferred: true } as const;
    };
    let clock = T0;
    const id = await seedWorkloadRow(db, { id: "wl_slow", kind: KIND, status: "queued", updatedAt: T0 });
    const row = await loadRunnableWorkload(db, CONTRIBUTIONS, id);
    vi.useFakeTimers();
    try {
      const running = runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run), { now: () => clock, heartbeatMs, cancelPollMs: 0 }), row, sig());
      await started.promise;
      // The body is STILL awaiting `gate` across this whole span — exactly the shape of a 31s vLLM summarize.
      clock += inFlightMs;
      await vi.advanceTimersByTimeAsync(inFlightMs);
      const reaped = await reapOrphanedWorkloads({ db, now: clock, staleThresholdMs: staleMs, reason: "heartbeat_stale" });
      const status = await loadWorkloadStatus(db, id);
      gate.resolve();
      await running;
      return { reaped, status };
    } finally {
      vi.useRealTimers();
    }
  }

  test("a long AWAITED item cannot starve the lease — the reaper leaves it alone", async () => {
    expect(await reapDuringPendingRun(staleMs / 4)).toEqual({ reaped: 0, status: "running" });
  });

  test("POSITIVE CONTROL: with the lease timer disabled the same run IS reaped (the fence can fail)", async () => {
    expect(await reapDuringPendingRun(0)).toEqual({ reaped: 1, status: "worker_died" });
  });
});
