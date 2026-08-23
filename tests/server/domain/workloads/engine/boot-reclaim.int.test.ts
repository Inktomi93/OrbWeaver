// Engine test: reclaimInFlightOnBoot (#529) — the single-replica BOOT disposition of orphaned in-flight
// rows. Distinct from the reaper's mirror next door: that one proves the LIVE-process sweep is
// terminal-only, this one proves boot re-queues what declares itself re-runnable, keeps the respawn bound,
// and still reaps everything else.
//
// NOT COVERED HERE, and deliberately: the deploy-skew arm (a row whose `kind` this build no longer ships).
// `workloads_kind_check` is built from the CURRENT tuple at table-create time, so a `freshDb` physically
// refuses to hold such a row — it only exists in a db file created by an older build. The guard mirrors the
// tolerance `toView` already carries for exactly that case.

import { workloads } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { reclaimInFlightOnBoot } from "../../../../../packages/server/src/domain/workloads/engine/boot-reclaim.ts";
import { getRecentWorkloadEvents } from "../../../../../packages/server/src/domain/workloads/engine/progress-bus.ts";
import { heartbeat } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, seedWorkloadRow, T0 } from "../_support.ts";

const CONTRIBUTIONS = fakeContributions();
/** Every shipped contribution declares `idempotent-restart`; the non-resumable arm is synthesized. */
const NON_RESUMABLE = { ...CONTRIBUTIONS, "reconcile-stats": { ...CONTRIBUTIONS["reconcile-stats"], resume: "none" } } as const;
const ID = castId<WorkloadId>("workload_orphan");

describe("reclaimInFlightOnBoot", () => {
  test("re-queues a resumable orphan: counts the respawn, clears the error, KEEPS the last progress", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });
    await heartbeat(db, ID, T0, { message: "12 of 400", current: 12, total: 400 });

    const report = await reclaimInFlightOnBoot({ db, contributions: CONTRIBUTIONS, now: T0 + 1000 });

    expect(report).toEqual({ requeued: 1, reaped: 0 });
    const [row] = await db.select().from(workloads).where(eq(workloads.id, ID));
    expect(row?.status).toBe("queued");
    expect(row?.respawns).toBe(1);
    expect(row?.error).toBeNull();
    // The reconnect truth survives — a re-queued backfill must not render as "no progress ever".
    expect(row?.progress).toEqual({ message: "12 of 400", current: 12, total: 400 });
    expect(getRecentWorkloadEvents(ID).map((event) => event.type)).toContain("status");
  });

  test("re-queues a row whose lease is FRESHER than the boot instant (no heartbeat grace at boot)", async () => {
    const db = await freshDb();
    // A heartbeat that landed in the same millisecond as boot. The old threshold-0 sweep (`updatedAt < now`)
    // skipped exactly this row, leaving a zombie holding its kind's single-active slot forever.
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });

    expect(await reclaimInFlightOnBoot({ db, contributions: CONTRIBUTIONS, now: T0 })).toEqual({ requeued: 1, reaped: 0 });
  });

  test("reaps a NON-resumable orphan to worker_died with the reason (the pre-#529 disposition)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });

    expect(await reclaimInFlightOnBoot({ db, contributions: NON_RESUMABLE, now: T0 + 1000 })).toEqual({ requeued: 0, reaped: 1 });
    const [row] = await db.select().from(workloads).where(eq(workloads.id, ID));
    expect(row?.status).toBe("worker_died");
    expect(row?.error).toContain("not resumable");
    expect(getRecentWorkloadEvents(ID).map((event) => event.type)).toContain("failed");
  });

  test("the respawn bound: a row already at the bound is reaped with the loop reason instead of re-queued", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });
    await db.update(workloads).set({ respawns: 3 }).where(eq(workloads.id, ID));

    expect(await reclaimInFlightOnBoot({ db, contributions: CONTRIBUTIONS, now: T0 + 1000 })).toEqual({ requeued: 0, reaped: 1 });
    const [row] = await db.select().from(workloads).where(eq(workloads.id, ID));
    expect(row?.status).toBe("worker_died");
    expect(row?.error).toContain("respawned 3 times");
  });

  test("PROGRESS RESETS THE BOUND: a run that reports a snapshot zeroes the respawn count", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });
    await db.update(workloads).set({ respawns: 3 }).where(eq(workloads.id, ID));

    // The lease UPDATE that carries a snapshot — the evidence of forward motion the bound is measured against.
    await heartbeat(db, ID, T0 + 10, { message: "still going" });
    const [beforeBoot] = await db.select().from(workloads).where(eq(workloads.id, ID));
    expect(beforeBoot?.respawns).toBe(0);

    expect(await reclaimInFlightOnBoot({ db, contributions: CONTRIBUTIONS, now: T0 + 1000 })).toEqual({ requeued: 1, reaped: 0 });
  });

  test("a bare lease tick (no snapshot) does NOT reset the bound", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });
    await db.update(workloads).set({ respawns: 3 }).where(eq(workloads.id, ID));

    await heartbeat(db, ID, T0 + 10);

    expect(await reclaimInFlightOnBoot({ db, contributions: CONTRIBUTIONS, now: T0 + 1000 })).toEqual({ requeued: 0, reaped: 1 });
  });

  test("leaves terminal and queued rows alone", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: castId<WorkloadId>("workload_done"), kind: "compute-themes", status: "succeeded", updatedAt: T0 });
    await seedWorkloadRow(db, { id: castId<WorkloadId>("workload_waiting"), kind: "reconcile-stats", status: "queued", updatedAt: T0 });

    expect(await reclaimInFlightOnBoot({ db, contributions: CONTRIBUTIONS, now: T0 + 1000 })).toEqual({ requeued: 0, reaped: 0 });
  });
});
