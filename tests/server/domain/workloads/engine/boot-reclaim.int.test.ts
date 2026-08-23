// Engine test: reclaimInFlightOnBoot (#529) — the single-replica BOOT disposition of orphaned in-flight
// rows. Distinct from the reaper's mirror next door: that one proves the LIVE-process sweep is
// terminal-only, this one proves boot re-queues what declares itself re-runnable, keeps the respawn bound,
// and still reaps everything else.
//
// The reap arms also pin the ATTRIBUTION (#560): each of the two terminal dispositions writes its OWN
// sentence from the shared `reap-record` dispatch plus the lease age observed before the stamp overwrote it,
// and NEITHER may write the steady-state stale-heartbeat sentence — that is the false line a forensics lane
// had to work around when both reap paths shared one wording.
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
/** The steady-state sweep's sentence — the one NO boot disposition may write (#560). */
const STALE_HEARTBEAT_SENTENCE = /heartbeat went stale/i;

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

  test("reaps a NON-resumable orphan to worker_died with the RESTART reason (the pre-#529 disposition)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });

    expect(await reclaimInFlightOnBoot({ db, contributions: NON_RESUMABLE, now: T0 + 1000 })).toEqual({ requeued: 0, reaped: 1 });
    const [row] = await db.select().from(workloads).where(eq(workloads.id, ID));
    expect(row?.status).toBe("worker_died");
    // The restart is the cause; the kind's `resume: none` is only why it was not re-queued (and is readable
    // off the contribution). The lease age is the tell that separates a boot kill from a grace-window expiry,
    // and `markTerminal` has already overwritten the column it was read from.
    expect(row?.error).toContain("the server restarted");
    expect(row?.error).toContain("1000ms");
    expect(row?.error).not.toMatch(STALE_HEARTBEAT_SENTENCE);
    expect(row?.updatedAt).toBe(T0 + 1000);
    expect(getRecentWorkloadEvents(ID).map((event) => event.type)).toContain("failed");
  });

  test("the respawn bound: a row already at the bound is reaped with its OWN loop reason instead of re-queued", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: ID, status: "running", updatedAt: T0 });
    await db.update(workloads).set({ respawns: 3 }).where(eq(workloads.id, ID));

    expect(await reclaimInFlightOnBoot({ db, contributions: CONTRIBUTIONS, now: T0 + 1000 })).toEqual({ requeued: 0, reaped: 1 });
    const [row] = await db.select().from(workloads).where(eq(workloads.id, ID));
    expect(row?.status).toBe("worker_died");
    // A loop death is operator-actionable in a way a single respawn is not, so it may share NEITHER of the
    // other two sentences.
    expect(row?.error).toContain("respawned 3 times");
    expect(row?.error).toContain("1000ms");
    expect(row?.error).not.toContain("the server restarted");
    expect(row?.error).not.toMatch(STALE_HEARTBEAT_SENTENCE);
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
