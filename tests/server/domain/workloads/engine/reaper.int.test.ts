// Engine test: reapOrphanedWorkloads — sweeps stale IN-FLIGHT rows to worker_died (freeing the kind's slot),
// leaves fresh rows alone, and is guarded (a terminal row is never reaped).

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { reapOrphanedWorkloads } from "../../../../../packages/server/src/domain/workloads/engine/reaper.ts";
import { loadWorkloadStatus } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, seedWorkloadRow, T0 } from "../_support.ts";

// The row read path narrows params against the contribution registry — the reaper's stale sweep reads rows.
const CONTRIBUTIONS = fakeContributions();

describe("reapOrphanedWorkloads", () => {
  test("reaps a stale in-flight row, leaves a fresh one, and emits failed(worker_died)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, {
      id: "wl_stale",
      kind: "compute-themes",
      status: "running",
      updatedAt: T0,
    });
    await seedWorkloadRow(db, {
      id: "wl_fresh",
      kind: "reconcile-stats",
      status: "running",
      updatedAt: T0 + 100_000,
    });
    const reaped = await reapOrphanedWorkloads({ db, contributions: CONTRIBUTIONS, now: T0 + 50_000 });
    expect(reaped).toBe(1);
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("wl_stale"))).toBe("worker_died");
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("wl_fresh"))).toBe("running");
    const events = getRecentWorkloadEvents(castId<WorkloadId>("wl_stale"));
    expect(events.map((e) => e.type)).toContain("failed");
  });

  test("does not reap a terminal row (guarded)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, {
      id: "wl_done",
      kind: "compute-themes",
      status: "succeeded",
      updatedAt: T0,
    });
    expect(await reapOrphanedWorkloads({ db, contributions: CONTRIBUTIONS, now: T0 + 100_000 })).toBe(0);
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("wl_done"))).toBe("succeeded");
  });
});
