// Engine test: runWorkload — the per-row state machine. Pins the success lifecycle (claim → succeeded +
// result + bus events), failure (→ failed + the PD-113 WORKLOAD_FAILED audit through the injected op),
// the claim-loser early-return, the cancelling→cancelled PIN (an aborted run that returned normally), and
// the reaper-vs-zombie guard (a row reaped mid-run is not resurrected). Timers are disabled
// (makeRunnerDeps `*Ms: 0`) so the run is synchronous + deterministic.
//
// The dispatched body is a TEST DOUBLE swapped into the registry (`contributionsWith`), never an owning
// domain's real contribution: this file tests the STATE MACHINE, and each domain's body is pinned at its own
// mirror. That also keeps this file stable as kinds re-home.

import { describe, vi } from "vitest";
import type { WorkloadRunnerDeps } from "../../../../../packages/server/src/domain/workloads/contract/service.ts";
import { getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { runWorkload } from "../../../../../packages/server/src/domain/workloads/engine/runner.ts";
import { loadWorkload, loadWorkloadStatus, markTerminal } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { contributionsWith, fakeContributions, makeRunnerDeps, seedWorkloadRow, T0 } from "../_support.ts";

// The row read path narrows params against the contribution registry.
const CONTRIBUTIONS = fakeContributions();

// The kind every case here dispatches: a real registered kind (so the row is valid + the read path narrows
// it) whose body this file replaces wholesale.
const KIND = "reconcile-world-state";

const sig = (): AbortSignal => new AbortController().signal;

describe("runWorkload", () => {
  test("claims, runs, stores the result, and emits started + succeeded", async () => {
    const db = await freshDb();
    const run = vi.fn(async () => ({ deferred: true }) as const);
    const id = await seedWorkloadRow(db, { id: "wl_ok", kind: KIND, status: "queued" });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
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
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
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
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run)), row, sig());
    expect(run).not.toHaveBeenCalled();
    expect(await loadWorkloadStatus(db, id)).toBe("running");
    expect(getRecentWorkloadEvents(id)).toHaveLength(0);
  });

  test("an aborted run is pinned to cancelled, never succeeded", async () => {
    const db = await freshDb();
    const run = vi.fn(async () => ({ deferred: true }) as const);
    const id = await seedWorkloadRow(db, { id: "wl_cxl", kind: KIND, status: "queued" });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
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
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
    await runWorkload(makeRunnerDeps(db, contributionsWith(KIND, run)), row, sig());
    expect(await loadWorkloadStatus(db, id)).toBe("worker_died");
    expect(getRecentWorkloadEvents(id).map((e) => e.type)).not.toContain("succeeded");
  });
});
