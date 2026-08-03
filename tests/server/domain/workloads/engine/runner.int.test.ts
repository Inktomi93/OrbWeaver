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
import { describe, vi } from "vitest";
import type { WorkloadContribution } from "../../../../../packages/server/src/domain/workloads/contract/contribution.ts";
import type { WorkloadRunnerDeps } from "../../../../../packages/server/src/domain/workloads/contract/service.ts";
import { getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
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
