// Engine test: runWorkload — the per-row state machine. Driven through `group-character-backfill`, whose
// body is a fake injected op, so this stays a pure ENGINE test: it must not depend on any owning domain's
// contribution body (those are tested at their own mirrors). Pins the success lifecycle (claim → succeeded +
// result + bus events), failure (→ failed + the PD-113 WORKLOAD_FAILED audit through the injected op),
// the claim-loser early-return, the cancelling→cancelled PIN (an aborted run that returned normally), and
// the reaper-vs-zombie guard (a row reaped mid-run is not resurrected). Timers are disabled
// (makeRunnerDeps `*Ms: 0`) so the run is synchronous + deterministic.

import { describe, vi } from "vitest";
import type { WorkloadRunnerDeps } from "../../../../../packages/server/src/domain/workloads/contract/service.ts";
import { getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { runWorkload } from "../../../../../packages/server/src/domain/workloads/engine/runner.ts";
import { loadWorkload, loadWorkloadStatus, markTerminal } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { fakeContributions, fakeEnv, makeRunnerDeps, seedWorkloadRow, T0 } from "../_support.ts";

// The row read path narrows params against the contribution registry.
const CONTRIBUTIONS = fakeContributions();

const sig = (): AbortSignal => new AbortController().signal;

describe("runWorkload", () => {
  test("claims, runs, stores the result, and emits started + succeeded", async () => {
    const db = await freshDb();
    const env = fakeEnv();
    const id = await seedWorkloadRow(db, {
      id: "wl_ok",
      kind: "group-character-backfill",
      status: "queued",
    });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
    await runWorkload(makeRunnerDeps(db, fakeContributions(env)), row, sig());
    expect(await loadWorkloadStatus(db, id)).toBe("succeeded");
    expect(env.character.backfillGroupCharacters).toHaveBeenCalledTimes(1);
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.result).toEqual({ scanned: 5, changed: 1 });
    const types = getRecentWorkloadEvents(id).map((e) => e.type);
    expect(types).toContain("started");
    expect(types).toContain("succeeded");
  });

  test("a thrown runner fails the row + emits failed + audits WORKLOAD_FAILED", async () => {
    const db = await freshDb();
    // The env op is readonly — build the double with the throwing op set at construction (no mutation).
    const env = fakeEnv({
      character: { backfillGroupCharacters: vi.fn(() => Promise.reject(new Error("boom"))) },
    });
    const audit = vi.fn<WorkloadRunnerDeps["audit"]>(() => Promise.resolve());
    const id = await seedWorkloadRow(db, {
      id: "wl_fail",
      kind: "group-character-backfill",
      status: "queued",
    });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
    await runWorkload(makeRunnerDeps(db, fakeContributions(env), { audit }), row, sig());
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
        metadata: { kind: "group-character-backfill", error: "boom" },
      },
      T0,
    );
  });

  test("the claim loser returns silently (a non-queued row is not re-run)", async () => {
    const db = await freshDb();
    const env = fakeEnv();
    const id = await seedWorkloadRow(db, {
      id: "wl_run",
      kind: "group-character-backfill",
      status: "running",
    });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
    await runWorkload(makeRunnerDeps(db, fakeContributions(env)), row, sig());
    expect(env.character.backfillGroupCharacters).not.toHaveBeenCalled();
    expect(await loadWorkloadStatus(db, id)).toBe("running");
    expect(getRecentWorkloadEvents(id)).toHaveLength(0);
  });

  test("an aborted run is pinned to cancelled, never succeeded", async () => {
    const db = await freshDb();
    const env = fakeEnv();
    const id = await seedWorkloadRow(db, {
      id: "wl_cxl",
      kind: "group-character-backfill",
      status: "queued",
    });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
    const ac = new AbortController();
    ac.abort();
    await runWorkload(makeRunnerDeps(db, fakeContributions(env)), row, ac.signal);
    expect(await loadWorkloadStatus(db, id)).toBe("cancelled");
    const types = getRecentWorkloadEvents(id).map((e) => e.type);
    expect(types).toContain("cancelled");
    expect(types).not.toContain("succeeded");
  });

  test("a row reaped mid-run is not resurrected (zombie guard)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, {
      id: "wl_zmb",
      kind: "group-character-backfill",
      status: "queued",
    });
    // The env op is readonly — build the double with the row-reaping op set at construction (no mutation).
    const env = fakeEnv({
      character: {
        backfillGroupCharacters: vi.fn(async () => {
          // simulate a reaper terminalizing the in-flight row WHILE the runner is working
          await markTerminal(db, { id, status: "worker_died", now: T0 });
          return { scanned: 0, changed: 0 };
        }),
      },
    });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    if (row === null) {
      throw new Error("seed failed");
    }
    await runWorkload(makeRunnerDeps(db, fakeContributions(env)), row, sig());
    expect(await loadWorkloadStatus(db, id)).toBe("worker_died");
    expect(getRecentWorkloadEvents(id).map((e) => e.type)).not.toContain("succeeded");
  });
});
