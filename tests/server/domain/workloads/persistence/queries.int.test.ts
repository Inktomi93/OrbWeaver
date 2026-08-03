// Integration test: ALL workloads persistence verbs against a real `:memory:` db. Pins the load-bearing
// physics — idempotent claim + loser, status-guarded terminals (succeeded only from running; zombie returns
// false), the race-safe cancel arms, the queued-row poison fail, the list filters/cap, the queue-head poison
// window, the reaper's stale sweep input, and `toView` poison tolerance.

import type { WorkloadStatus } from "@orb/contracts/workloads";
import type { WorkloadId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
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
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeContributions, seedUser, seedWorkloadRow, T0 } from "../_support.ts";

// The params VALIDATOR the read path narrows rows with (every kind's schema, keyed by kind).
const CONTRIBUTIONS = fakeContributions();

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
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
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
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    expect(row?.updatedAt).toBe(T0 + 999);
    // No progress passed ⇒ the column is untouched (a lease tick before the first report writes no snapshot).
    expect(row?.progress).toBeNull();
  });

  test("carries the DURABLE progress snapshot in the SAME update (one write path)", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "running", updatedAt: T0 });
    await heartbeat(db, id, T0 + 100, { message: "chunking", current: 3, total: 10 });
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.progress).toEqual({ message: "chunking", current: 3, total: 10 });
    // A later snapshot REPLACES the previous one (the column is the latest position, not a log).
    await heartbeat(db, id, T0 + 200, { message: "embedding", current: 9, total: 10 });
    expect((await loadWorkload(db, CONTRIBUTIONS, id))?.progress).toEqual({ message: "embedding", current: 9, total: 10 });
  });

  test("a terminal row's lease write is refused (status-guarded) — progress cannot resurrect it", async () => {
    const db = await freshDb();
    const id = await seedWorkloadRow(db, { status: "succeeded", updatedAt: T0 });
    await heartbeat(db, id, T0 + 500, { message: "late" });
    const row = await loadWorkload(db, CONTRIBUTIONS, id);
    expect(row?.updatedAt).toBe(T0);
    expect(row?.progress).toBeNull();
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
    const all = await listWorkloads(db, CONTRIBUTIONS, {});
    expect(all.map((r) => r.id)).toEqual(["w2", "w1"]);
    expect((await listWorkloads(db, CONTRIBUTIONS, { kind: "compute-themes" })).map((r) => r.id)).toEqual(["w2"]);
    expect((await listWorkloads(db, CONTRIBUTIONS, { status: "succeeded" })).map((r) => r.id)).toEqual(["w1"]);
    expect((await listWorkloads(db, CONTRIBUTIONS, { ownerId: owner })).map((r) => r.id)).toEqual(["w2"]);
    expect((await listWorkloads(db, CONTRIBUTIONS, { since: T0 + 5 })).map((r) => r.id)).toEqual(["w2"]);
  });

  // The on-record data-loss footgun, closed: a row whose params blob no longer parses used to VANISH from
  // list/get (invisible, unfixable, un-cancellable). It is now VISIBLE and flagged — the operator can see
  // and act on it. A row whose KIND this build doesn't ship still drops (it cannot even be spelled).
  test("a params-poison row is VISIBLE (params null + poison true), not silently dropped", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "good", kind: "reconcile-stats", status: "queued", createdAt: T0 });
    // a known kind but params that fail its schema → poison on the read path
    await seedWorkloadRow(db, {
      id: "poison",
      kind: "compute-themes",
      status: "queued",
      params: { k: -5 },
      createdAt: T0 + 1,
    });
    const rows = await listWorkloads(db, CONTRIBUTIONS, {});
    expect(rows.map((r) => r.id)).toEqual(["poison", "good"]);
    const poison = rows.find((r) => r.id === "poison");
    expect(poison?.poison).toBe(true);
    expect(poison?.params).toBeNull();
    // …and the rest of the row is intact, so the pane can render + act on it.
    expect(poison?.kind).toBe("compute-themes");
    expect(poison?.status).toBe("queued");
    expect(rows.find((r) => r.id === "good")?.poison).toBe(false);
  });
});

describe("nextRunnableWorkload (queue head + poison fail-in-place)", () => {
  test("returns the oldest queued row by (scheduledAt, createdAt)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "newer", kind: "compute-themes", scheduledAt: T0 + 100 });
    await seedWorkloadRow(db, { id: "older", kind: "reconcile-stats", scheduledAt: T0 });
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep"))?.id).toBe("older");
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
    const next = await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 50, "sweep");
    expect(next?.id).toBe("valid");
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("poison"))).toBe("failed");
  });
});

// The head-blocking defect's regression floor, at the QUERY level: the queue head is per-LANE, so an
// interactive row is dispatchable while the sweep lane's own head sits in front of it in creation order.
describe("nextRunnableWorkload (lane scoping)", () => {
  test("each lane sees ONLY its own queue — an older sweep row never fronts an interactive one", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "sweep_head", kind: "import-st", lane: "sweep", scheduledAt: T0 });
    await seedWorkloadRow(db, {
      id: "interactive_row",
      kind: "databank-ingest",
      lane: "interactive",
      // A REAL branded TypeID — a fabricated id fails the contribution schema and the row would poison-drop.
      params: { documentId: mintTypeId(ID_PREFIX.document) },
      scheduledAt: T0 + 1000,
    });
    // The interactive row is DEFERRED to T0+1000, so at T0 it is not due (the deferral gate, below) — the
    // lane-scoping claim is asserted at its instant, where both lanes hand back their OWN head.
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "interactive")).toBeNull();
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 1000, "interactive"))?.id).toBe("interactive_row");
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 1000, "sweep"))?.id).toBe("sweep_head");
  });

  test("a lane with no queued rows polls null while the other lane has work", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "sweep_only", kind: "reconcile-stats", lane: "sweep" });
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "interactive")).toBeNull();
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep"))?.id).toBe("sweep_only");
  });
});

// The "Run at" affordance's regression floor: `scheduledAt` is a DUE INSTANT, not a sort hint. Before this
// gate existed a future-dated row was dispatched by the very next poll (~2s), so the client's deferral was a
// silent no-op.
describe("nextRunnableWorkload (scheduledAt deferral gate)", () => {
  test("a future-dated row is NOT dispatched before its instant, and IS at/after it", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "deferred", kind: "reconcile-stats", scheduledAt: T0 + 1000 });
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep")).toBeNull();
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 999, "sweep")).toBeNull();
    // Its own instant counts as due (the gate is `<=`, so a poll landing exactly on it dispatches).
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 1000, "sweep"))?.id).toBe("deferred");
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 5000, "sweep"))?.id).toBe("deferred");
    // …and it was never touched while it waited (deferred ≠ failed/poison — it is still queued).
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("deferred"))).toBe("queued");
  });

  test("a deferred row does NOT starve its lane — a later-queued DUE row wins the head", async () => {
    const db = await freshDb();
    // Queued FIRST and sorting first by both order keys if it were visible — the starvation shape.
    await seedWorkloadRow(db, { id: "deferred", kind: "compute-themes", params: { k: 1 }, scheduledAt: T0 + 1000, createdAt: T0 });
    await seedWorkloadRow(db, { id: "due", kind: "reconcile-stats", scheduledAt: T0 + 10, createdAt: T0 + 10 });
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 10, "sweep"))?.id).toBe("due");
    // Once BOTH are due the (scheduledAt, createdAt) order resumes — the due row is still earliest.
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 1000, "sweep"))?.id).toBe("due");
  });
});

describe("nextRunnableWorkload (dependsOn DAG gate)", () => {
  const depId = castId<WorkloadId>("dep");
  const depBId = castId<WorkloadId>("dep_b");

  test("an empty dependsOn dispatches immediately (unchanged)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "solo", kind: "reconcile-stats", dependsOn: null });
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep"))?.id).toBe("solo");
  });

  test("waits (not dispatched, not failed) while a dependency is still active", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "dep", kind: "compute-themes", status: "running" });
    await seedWorkloadRow(db, {
      id: "dependent",
      kind: "reconcile-stats",
      status: "queued",
      dependsOn: [depId],
    });
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep")).toBeNull();
    // still queued — the gate leaves it un-dispatched, it did NOT fail.
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("dependent"))).toBe("queued");
  });

  test("dispatches once every dependency has succeeded", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "dep", kind: "compute-themes", status: "succeeded" });
    await seedWorkloadRow(db, {
      id: "dependent",
      kind: "reconcile-stats",
      status: "queued",
      dependsOn: [depId],
    });
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep"))?.id).toBe("dependent");
  });

  // The blocked row FRONTS the head window (earliest by both order keys) — the gate must SKIP it, not stop
  // the scan, or one waiting dependent would starve every unblocked row behind it in its lane.
  test("a blocked dependent does NOT starve its lane — the next unblocked row is returned", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "dep", kind: "compute-themes", status: "running", scheduledAt: T0, createdAt: T0 });
    await seedWorkloadRow(db, {
      id: "blocked",
      kind: "import-st",
      status: "queued",
      dependsOn: [depId],
      scheduledAt: T0,
      createdAt: T0,
    });
    await seedWorkloadRow(db, { id: "unblocked", kind: "reconcile-stats", status: "queued", scheduledAt: T0 + 5, createdAt: T0 + 5 });
    expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 5, "sweep"))?.id).toBe("unblocked");
    // …and the skip is not a mutation: the blocked row is untouched, still waiting on its dep.
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("blocked"))).toBe("queued");
  });

  test("a FAILED dependency fails the dependent with dependency_failed (it never runs)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "dep", kind: "compute-themes", status: "failed" });
    await seedWorkloadRow(db, {
      id: "dependent",
      kind: "reconcile-stats",
      status: "queued",
      dependsOn: [depId],
    });
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0 + 9, "sweep")).toBeNull();
    const dependent = await loadWorkload(db, CONTRIBUTIONS, castId<WorkloadId>("dependent"));
    expect(dependent?.status).toBe("failed");
    expect(dependent?.error).toContain("did not succeed");
  });

  test("a cancelled/worker_died dependency also counts as a dependency failure", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, { id: "dep", kind: "compute-themes", status: "cancelled" });
    await seedWorkloadRow(db, {
      id: "dependent",
      kind: "reconcile-stats",
      status: "queued",
      dependsOn: [depId],
    });
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep")).toBeNull();
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("dependent"))).toBe("failed");
  });

  test("an absent dependency fails the dependent (it can never succeed)", async () => {
    const db = await freshDb();
    await seedWorkloadRow(db, {
      id: "dependent",
      kind: "reconcile-stats",
      status: "queued",
      dependsOn: [castId<WorkloadId>("never_existed")],
    });
    expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep")).toBeNull();
    expect(await loadWorkloadStatus(db, castId<WorkloadId>("dependent"))).toBe("failed");
  });

  describe("multi-dependency (EVERY dep must be terminal + succeeded)", () => {
    async function seedTwoDepDependent(db: Awaited<ReturnType<typeof freshDb>>, a: WorkloadStatus, b: WorkloadStatus): Promise<void> {
      await seedWorkloadRow(db, { id: "dep", kind: "compute-themes", status: a });
      await seedWorkloadRow(db, { id: "dep_b", kind: "find-duplicates", status: b });
      await seedWorkloadRow(db, {
        id: "dependent",
        kind: "reconcile-stats",
        status: "queued",
        dependsOn: [depId, depBId],
      });
    }

    test("waits while one of two deps is still active", async () => {
      const db = await freshDb();
      await seedTwoDepDependent(db, "succeeded", "running");
      expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep")).toBeNull();
      expect(await loadWorkloadStatus(db, castId<WorkloadId>("dependent"))).toBe("queued");
    });

    test("dispatches only when BOTH deps succeeded", async () => {
      const db = await freshDb();
      await seedTwoDepDependent(db, "succeeded", "succeeded");
      expect((await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep"))?.id).toBe("dependent");
    });

    test("fails fast when one dep failed even if the other is still active", async () => {
      const db = await freshDb();
      await seedTwoDepDependent(db, "running", "failed");
      expect(await nextRunnableWorkload(db, CONTRIBUTIONS, T0, "sweep")).toBeNull();
      expect(await loadWorkloadStatus(db, castId<WorkloadId>("dependent"))).toBe("failed");
    });
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
    const stale = await findStaleInFlight(db, CONTRIBUTIONS, T0 + 50_000);
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
    } as unknown as Parameters<typeof toView>[1];
    expect(toView(CONTRIBUTIONS, raw)).toBeNull();
  });

  test("insert → load round-trips the typed row", async () => {
    const db = await freshDb();
    await insertWorkload(db, {
      id: castId<WorkloadId>("workload_rt"),
      kind: "compute-themes",
      mode: "singular",
      admissionKey: "none",
      lane: "sweep",
      params: { k: 7 },
      ownerId: null,
      dependsOn: null,
      scheduledAt: T0,
      createdAt: T0,
    });
    const row = await loadWorkload(db, CONTRIBUTIONS, castId<WorkloadId>("workload_rt"));
    expect(row?.kind).toBe("compute-themes");
    expect(row?.params).toEqual({ k: 7 });
    expect(row?.status).toBe("queued");
  });
});
