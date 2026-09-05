// Engine test: reapOrphanedWorkloads — sweeps stale IN-FLIGHT rows to worker_died (freeing the kind's slot),
// leaves fresh rows alone, and is guarded (a terminal row is never reaped).

import type { WorkloadKind } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { describe } from "vitest";
import { getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { reapOrphanedWorkloads } from "../../../../../packages/server/src/domain/workloads/engine/reaper.ts";
import { loadWorkload, loadWorkloadStatus } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, seedWorkloadRow, T0 } from "../_support.ts";

// `loadWorkload` narrows params against the contribution registry; the reaper's own sweep reads RAW rows (#1413).
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
    const reaped = await reapOrphanedWorkloads({ db, now: T0 + 50_000, reason: "heartbeat_stale" });
    expect(reaped).toBe(1);
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("wl_stale"))).toBe("worker_died");
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("wl_fresh"))).toBe("running");
    const events = getRecentWorkloadEvents(castId<WorkloadId>("wl_stale"));
    expect(events.map((e) => e.type)).toContain("failed");
  });

  // #560, the steady-state arm of the attribution pin (its boot twin lives at
  // tests/server/entry/boot/reclaim-locks.int.test.ts): this sweep runs under a LIVE worker, so the row really
  // did stop bumping its lease — and the observed age is the number that separates a genuine grace-window
  // expiry from a restart, which `markTerminal` would otherwise erase by overwriting `updatedAt`.
  test("attributes a live sweep to the stale heartbeat and records the observed lease age", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { id: "wl_stale", kind: "compute-themes", status: "running", updatedAt: T0 });

    await reapOrphanedWorkloads({ db, now: T0 + 50_000, reason: "heartbeat_stale" });

    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    expect(row?.error).toContain("heartbeat went stale");
    expect(row?.error).toContain("50000ms");
    // The same reap emits the reason on the bus, so a live watcher reads it without re-querying the row.
    const failed = getRecentWorkloadEvents(id).find((e) => e.type === "failed");
    expect(failed?.type === "failed" && failed.error.message).toContain("50000ms");
  });

  // #1413 — THE SWEEP DISPOSES OF ROWS, IT DOES NOT READ THEM. The stale sweep used to project every
  // candidate through `toView`, which returns `null` for a kind this build does not ship and drops it: an
  // unknown-kind in-flight row could never reach `markTerminal` and stayed `running`/`cancelling` FOREVER,
  // holding its kind's single-active slot. Only a process restart cleared it (the boot reclaim reads raw
  // columns), so the live system never healed. It reaches production on deploy skew — a row written by a
  // newer build, reaped by an older one — or any kind rename. The boot reclaim already had this right; this
  // is the steady-state half.
  //
  // NOT a poison-row claim: a KNOWN kind whose params blob fails its schema comes back as a real object
  // (`params: null, poison: true`) and always survived the sweep. That path is deliberate and untouched.
  test("an UNKNOWN-kind stale row is reaped, not skipped — and emits failed exactly ONCE", async () => {
    const db = await freshDb();
    // The column's declared type is the kind tuple, so a kind this build dropped is a RUNTIME possibility
    // only — and `workloads_kind_check` (the DDL's own kind enumeration) refuses to let one be WRITTEN, which
    // is why the check is suspended for exactly this insert. That refusal is also the honest shape of the
    // production case: the row is never written by THIS build. It is written under a schema whose CHECK
    // listed the kind (a newer deploy, or a pre-rename era) and then READ by a build whose `WORKLOAD_KINDS`
    // tuple does not, since a CHECK constrains writes and says nothing about rows already on disk.
    const removedKind = "legacy-removed-kind" as WorkloadKind;
    await db.run(sql`PRAGMA ignore_check_constraints = ON`);
    await seedWorkloadRow(db, { id: "wl_skew", kind: removedKind, status: "running", updatedAt: T0 });
    await db.run(sql`PRAGMA ignore_check_constraints = OFF`);
    await seedWorkloadRow(db, { id: "wl_known", kind: "compute-themes", status: "running", updatedAt: T0 });

    const reaped = await reapOrphanedWorkloads({ db, now: T0 + 50_000, reason: "heartbeat_stale" });

    expect(reaped).toBe(2);
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("wl_skew"))).toBe("worker_died");
    const failures = getRecentWorkloadEvents(castId<WorkloadId>("wl_skew")).filter((e) => e.type === "failed");
    expect(failures).toHaveLength(1);
  });

  test("does not reap a terminal row (guarded)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, {
      id: "wl_done",
      kind: "compute-themes",
      status: "succeeded",
      updatedAt: T0,
    });
    expect(await reapOrphanedWorkloads({ db, now: T0 + 100_000, reason: "heartbeat_stale" })).toBe(0);
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("wl_done"))).toBe("succeeded");
  });
});
