// Integration test: ALL workloads persistence verbs against a real `:memory:` db. Pins the load-bearing
// physics — idempotent claim + loser, status-guarded terminals (succeeded only from running; zombie returns
// false), the race-safe cancel arms, the queued-row poison fail, the list filters/cap, the queue-head poison
// window, the reaper's stale sweep input, and `toView` poison tolerance.

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import {
  failQueuedRow,
  findStaleInFlight,
  heartbeat,
  insertWorkload,
  listWorkloads,
  loadWorkload,
  loadWorkloadStatus,
  markCancelling,
  markStarted,
  markTerminal,
  nextRunnableWorkload,
  toView,
} from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { seedUser, seedWorkloadRow, T0 } from "../_support.ts";

describe("markStarted (idempotent claim)", () => {
  test("claims a queued row once; the second caller (loser) gets false", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "queued" });
    expect(await markStarted(db, id, T0 + 1)).toBe(true);
    expect(await loadWorkloadStatus(db, id)).toBe("running");
    expect(await markStarted(db, id, T0 + 2)).toBe(false);
  });
});

describe("markTerminal (status-guarded, linear)", () => {
  test("succeeded moves only from running + stores the result", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "running" });
    const moved = await markTerminal(db, {
      id,
      status: "succeeded",
      result: { owners: 1, characters: 4 },
      now: T0 + 5,
    });
    expect(moved).toBe(true);
    const row = await loadWorkload(db, id);
    expect(row?.status).toBe("succeeded");
    expect(row?.result).toEqual({ owners: 1, characters: 4 });
  });

  test("succeeded does NOT move a cancelling row (no cancelling→succeeded)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "cancelling" });
    expect(await markTerminal(db, { id, status: "succeeded", now: T0 })).toBe(false);
    expect(await loadWorkloadStatus(db, id)).toBe("cancelling");
  });

  test("a zombie (already-terminal) row is not re-terminalized", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "worker_died" });
    expect(await markTerminal(db, { id, status: "succeeded", now: T0 })).toBe(false);
    expect(await markTerminal(db, { id, status: "failed", error: "x", now: T0 })).toBe(false);
    expect(await loadWorkloadStatus(db, id)).toBe("worker_died");
  });
});

describe("markCancelling (race-safe, idempotent)", () => {
  test("queued → cancelled", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "queued" });
    expect(await markCancelling(db, id, T0)).toEqual({ status: "cancelled" });
  });

  test("running → cancelling", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "running" });
    expect(await markCancelling(db, id, T0)).toEqual({ status: "cancelling" });
  });

  test("an already-cancelling row is idempotent (cancelling)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "cancelling" });
    expect(await markCancelling(db, id, T0)).toEqual({ status: "cancelling" });
  });

  test("a terminal/absent row is a no-op (null)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "succeeded" });
    expect(await markCancelling(db, id, T0)).toEqual({ status: null });
    expect(await markCancelling(db, castId<WorkloadId>("workload_absent"), T0)).toEqual({
      status: null,
    });
  });
});

describe("failQueuedRow (poison path)", () => {
  test("fails a queued row; refuses a running row", async () => {
    const db = await freshDb();
    const queued = await seedWorkloadRow(db, {
      id: "workload_q",
      kind: "import-st",
      status: "queued",
    });
    expect(await failQueuedRow(db, queued, "bad", T0)).toBe(true);
    expect(await loadWorkloadStatus(db, queued)).toBe("failed");
    const running = await seedWorkloadRow(db, {
      id: "workload_r",
      kind: "compute-themes",
      status: "running",
    });
    expect(await failQueuedRow(db, running, "bad", T0)).toBe(false);
  });
});

describe("heartbeat", () => {
  test("bumps updatedAt for an in-flight row", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "running", updatedAt: T0 });
    await heartbeat(db, id, T0 + 999);
    const row = await loadWorkload(db, id);
    expect(row?.updatedAt).toBe(T0 + 999);
  });
});

describe("listWorkloads (filters, newest-first, poison-tolerant)", () => {
  test("filters by kind/status/owner/since and orders newest-first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedWorkloadRow(db, {
      id: "w1",
      kind: "reconcile-stats",
      status: "succeeded",
      createdAt: T0,
    });
    await seedWorkloadRow(db, {
      id: "w2",
      kind: "compute-themes",
      status: "queued",
      ownerId: owner,
      createdAt: T0 + 10,
    });
    const all = await listWorkloads(db, {});
    expect(all.map((r) => r.id)).toEqual(["w2", "w1"]); // newest first
    expect((await listWorkloads(db, { kind: "compute-themes" })).map((r) => r.id)).toEqual(["w2"]);
    expect((await listWorkloads(db, { status: "succeeded" })).map((r) => r.id)).toEqual(["w1"]);
    expect((await listWorkloads(db, { ownerId: owner })).map((r) => r.id)).toEqual(["w2"]);
    expect((await listWorkloads(db, { since: T0 + 5 })).map((r) => r.id)).toEqual(["w2"]);
  });

  test("filters out a params-poison row (never throws)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "good", kind: "reconcile-stats", status: "queued" });
    // a known kind but params that fail its schema → poison on the read path
    await seedWorkloadRow(db, {
      id: "poison",
      kind: "compute-themes",
      status: "queued",
      params: { k: -5 },
    });
    expect((await listWorkloads(db, {})).map((r) => r.id)).toEqual(["good"]);
  });
});

describe("nextRunnableWorkload (queue head + poison fail-in-place)", () => {
  test("returns the oldest queued row by (scheduledAt, createdAt)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "newer", kind: "compute-themes", scheduledAt: T0 + 100 });
    await seedWorkloadRow(db, { id: "older", kind: "reconcile-stats", scheduledAt: T0 });
    expect((await nextRunnableWorkload(db, T0))?.id).toBe("older");
  });

  test("fails a poison head row in place and returns the next valid one", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, {
      id: "poison",
      kind: "compute-themes",
      params: { k: -1 },
      scheduledAt: T0,
    });
    await seedWorkloadRow(db, { id: "valid", kind: "reconcile-stats", scheduledAt: T0 + 1 });
    const next = await nextRunnableWorkload(db, T0 + 50);
    expect(next?.id).toBe("valid");
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("poison"))).toBe("failed");
  });
});

describe("findStaleInFlight (reaper input)", () => {
  test("returns only in-flight rows older than the threshold", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, {
      id: "stale",
      kind: "compute-themes",
      status: "running",
      updatedAt: T0,
    });
    await seedWorkloadRow(db, {
      id: "fresh",
      kind: "reconcile-stats",
      status: "running",
      updatedAt: T0 + 100_000,
    });
    const stale = await findStaleInFlight(db, T0 + 50_000);
    expect(stale.map((r) => r.id)).toEqual(["stale"]);
  });
});

describe("toView (poison tolerance)", () => {
  test("an unknown kind narrows to null", () => {
    const raw = {
      id: castId<WorkloadId>("workload_x"),
      kind: "legacy-removed-kind",
      status: "queued",
      params: {},
      result: null,
      ownerId: null,
      dependsOn: null,
      error: null,
      scheduledAt: T0,
      createdAt: T0,
      updatedAt: T0,
      // a deliberately invalid/removed kind for the poison test — through `unknown` since it can't overlap.
    } as unknown as Parameters<typeof toView>[0];
    expect(toView(raw)).toBeNull();
  });

  test("insert → load round-trips the typed row", async () => {
    const db = await freshDb();
    await insertWorkload(db, {
      id: castId<WorkloadId>("workload_rt"),
      kind: "compute-themes",
      params: { k: 7 },
      ownerId: null,
      dependsOn: null,
      scheduledAt: T0,
      createdAt: T0,
    });
    const row = await loadWorkload(db, castId<WorkloadId>("workload_rt"));
    expect(row?.kind).toBe("compute-themes");
    expect(row?.params).toEqual({ k: 7 });
    expect(row?.status).toBe("queued");
  });
});
