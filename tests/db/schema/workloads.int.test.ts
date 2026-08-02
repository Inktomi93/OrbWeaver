// .int test for schema/workloads: the test-mirror (db enum === contracts tuple, D34), a JSON round-trip,
// the nullable ownerId FK, and the load-bearing single-active partial unique indexes (the MODE model: a BULK
// run locks GLOBAL on `workloads_mode_active_bulk` (kind); a SINGULAR run locks PER-OWNER on
// `workloads_mode_active_singular` (kind, owner_id) so two users each run their own instance — the WHERE
// status list derives from ACTIVE_WORKLOAD_STATUSES; the partition is the `mode` column). Real libSQL
// :memory: via freshDb (FK ON).

import {
  ACTIVE_WORKLOAD_STATUSES,
  SCHEDULE_CADENCES,
  WORKLOAD_KINDS,
  WORKLOAD_LANES,
  WORKLOAD_MODES,
  WORKLOAD_SOURCES,
  WORKLOAD_STATUSES,
} from "@orb/contracts/workloads";
import { users, workloadSchedules, workloads } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { Handle, UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

// ── Test-mirror (D34): the db column enum derives the ONE contracts tuple ──────────────────────────────
test("workloads.kind enum mirrors WORKLOAD_KINDS (db derives the contracts tuple, never re-spells)", () => {
  expect(workloads.kind.enumValues).toEqual([...WORKLOAD_KINDS]);
});

test("workloads.status enum mirrors WORKLOAD_STATUSES (db derives the contracts tuple)", () => {
  expect(workloads.status.enumValues).toEqual([...WORKLOAD_STATUSES]);
});

test("workloads.mode enum mirrors WORKLOAD_MODES (db derives the contracts tuple)", () => {
  expect(workloads.mode.enumValues).toEqual([...WORKLOAD_MODES]);
});

test("workloads.source enum mirrors WORKLOAD_SOURCES (db derives the contracts tuple)", () => {
  expect(workloads.source.enumValues).toEqual([...WORKLOAD_SOURCES]);
});

test("workloads.lane enum mirrors WORKLOAD_LANES (db derives the contracts tuple)", () => {
  expect(workloads.lane.enumValues).toEqual([...WORKLOAD_LANES]);
});

// The lane is EXECUTION, and the CHECK is what keeps a bad writer out of a lane that has no worker loop.
test("workloads.lane defaults to `sweep` and its CHECK refuses a non-member lane", async () => {
  const db = await freshDb();
  const id = castId<WorkloadId>("workload_lane_default");
  await db.insert(workloads).values({ id, kind: "reconcile-stats" });
  const rows = await db.select().from(workloads).where(eq(workloads.id, id));
  expect(rows[0]?.lane).toBe("sweep");
  expect(rows[0]?.progress).toBeNull();

  let caught: unknown;
  try {
    await db.run(sql`insert into workloads (id, kind, lane) values ('workload_bad_lane', 'reconcile-stats', 'express')`);
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)).toMatchObject({ kind: "check" });
});

// The durable progress snapshot round-trips as JSON (the reconnect truth the pane reads off `list`).
test("workloads.progress round-trips the WorkloadProgress JSON blob", async () => {
  const db = await freshDb();
  const id = castId<WorkloadId>("workload_progress_rt");
  await db.insert(workloads).values({ id, kind: "import-st", progress: { message: "importing", current: 4, total: 9, pct: 44 } });
  const rows = await db.select().from(workloads).where(eq(workloads.id, id));
  expect(rows[0]?.progress).toEqual({ message: "importing", current: 4, total: 9, pct: 44 });
});

// ── workload_schedules (the TIME dimension) — the enum columns derive the contracts tuples too ──────────
test("workload_schedules.kind enum mirrors WORKLOAD_KINDS (db derives the contracts tuple)", () => {
  expect(workloadSchedules.kind.enumValues).toEqual([...WORKLOAD_KINDS]);
});

test("workload_schedules.mode enum mirrors WORKLOAD_MODES", () => {
  expect(workloadSchedules.mode.enumValues).toEqual([...WORKLOAD_MODES]);
});

test("workload_schedules.cadence enum mirrors SCHEDULE_CADENCES", () => {
  expect(workloadSchedules.cadence.enumValues).toEqual([...SCHEDULE_CADENCES]);
});

test("workload_schedules insert→select round-trips (defaults mode=singular, enabled=true, JSON params)", async () => {
  const db = await freshDb();
  const ownerId = castId<UserId>("user_sched_owner");
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>("so"), role: "user" });
  const id = castId<WorkloadScheduleId>("workload_schedule_rt");
  await db.insert(workloadSchedules).values({
    id,
    ownerId,
    kind: "index",
    params: { source: "text" },
    cadence: "daily",
    nextRunAt: 1000,
  });
  const rows = await db.select().from(workloadSchedules).where(eq(workloadSchedules.id, id));
  expect(rows[0]?.mode).toBe("singular"); // column default
  expect(rows[0]?.enabled).toBe(true); // column default
  expect(rows[0]?.params).toEqual({ source: "text" });
  expect(rows[0]?.nextRunAt).toBe(1000);
  expect(rows[0]?.lastRunAt).toBeNull();
});

test("workload_schedules.ownerId CASCADE-deletes with its owner (live config, not an audit row)", async () => {
  const db = await freshDb();
  const ownerId = castId<UserId>("user_sched_cascade");
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>("sc"), role: "user" });
  await db.insert(workloadSchedules).values({
    id: castId<WorkloadScheduleId>("workload_schedule_cascade"),
    ownerId,
    kind: "reconcile-stats",
    cadence: "weekly",
    nextRunAt: 1,
  });
  await db.delete(users).where(eq(users.id, ownerId));
  const remaining = await db.select().from(workloadSchedules);
  expect(remaining).toHaveLength(0); // cascaded away with the owner
});

// The index WHERE list is derived from ACTIVE_WORKLOAD_STATUSES — assert the active subset is what the
// behavioral lock test below relies on (the named mirror of the partial-index predicate).
test("ACTIVE_WORKLOAD_STATUSES is the [queued, running, cancelling] slot-holder set the index keys on", () => {
  expect([...ACTIVE_WORKLOAD_STATUSES]).toEqual(["queued", "running", "cancelling"]);
});

// ── Round-trip: branded id, kind, default status + mode, JSON params/result ────────────────────────────
test("workloads insert→select round-trips (defaults status=queued + mode=singular + source=none, JSON params)", async () => {
  const db = await freshDb();
  const id = castId<WorkloadId>("workload_roundtrip");
  await db.insert(workloads).values({
    id,
    kind: "reconcile-stats",
    params: { characterId: "character_x" },
  });

  const rows = await db.select().from(workloads).where(eq(workloads.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.kind).toBe("reconcile-stats");
  expect(rows[0]?.status).toBe("queued"); // the column default
  expect(rows[0]?.mode).toBe("singular"); // the column default
  expect(rows[0]?.source).toBe("none"); // the column default — the non-index lock sentinel
  expect(rows[0]?.params).toEqual({ characterId: "character_x" });
  expect(rows[0]?.result).toBeNull();
  expect(rows[0]?.ownerId).toBeNull(); // nullable — a system/scheduler row has no owner
  expect(rows[0]?.dependsOn).toBeNull();
});

// ── ownerId FK (nullable; KEEP per D23, SET NULL on user delete) ──────────────────────────────────────
test("workloads.ownerId FKs users and survives a null owner", async () => {
  const db = await freshDb();
  const ownerId = castId<UserId>("user_owner");
  await db.insert(users).values({ id: ownerId, handle: castId<Handle>("owner"), role: "admin" });

  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_owned"),
    kind: "reconcile-stats",
    ownerId,
  });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_system"),
    kind: "refresh-model-catalog",
  });

  const owned = await db
    .select()
    .from(workloads)
    .where(eq(workloads.id, castId<WorkloadId>("workload_owned")));
  expect(owned[0]?.ownerId).toBe(ownerId);
});

test("a bad ownerId FK is rejected (the FK is enforced)", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(workloads).values({
      id: castId<WorkloadId>("workload_badfk"),
      kind: "csls",
      ownerId: castId<UserId>("user_does_not_exist"),
    });
  } catch (err) {
    caught = err;
  }
  const violation = isConstraintViolation(caught);
  expect(violation).toBeDefined();
  expect(violation?.kind).toBe("foreign-key");
});

// ── The single-active partial unique indexes (the cross-replica lock, per MODE) ────────────────────────
// A BULK run locks GLOBAL — two active bulk rows of one kind collide regardless of owner (here both null).
test("a second ACTIVE BULK row of a kind collides globally (reconcile-stats, queued vs queued)", async () => {
  const db = await freshDb();
  await db.insert(workloads).values({ id: castId<WorkloadId>("workload_q1"), kind: "reconcile-stats", mode: "bulk" });

  let caught: unknown;
  try {
    await db.insert(workloads).values({ id: castId<WorkloadId>("workload_q2"), kind: "reconcile-stats", mode: "bulk" });
  } catch (err) {
    caught = err;
  }
  const violation = isConstraintViolation(caught);
  expect(violation).toBeDefined();
  expect(violation?.kind).toBe("unique");
});

// A SINGULAR run locks PER-(OWNER, SOURCE) — the SAME owner can't hold two active slots of one (kind, source).
test("a second ACTIVE SINGULAR row + SAME owner + SAME source collides (index{text} per (kind, owner, source))", async () => {
  const db = await freshDb();
  const owner = castId<UserId>("user_a");
  await db.insert(users).values({ id: owner, handle: castId<Handle>("a"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_a1"),
    kind: "index",
    source: "text",
    mode: "singular",
    ownerId: owner,
  });

  let caught: unknown;
  try {
    await db.insert(workloads).values({
      id: castId<WorkloadId>("workload_a2"),
      kind: "index",
      source: "text",
      mode: "singular",
      ownerId: owner,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

// THE CRUX of the flexible collapse: one owner runs index{text} + index{image} CONCURRENTLY — different
// source, different lock slot. (What the two former embed-corpus/embed-assets kinds gave, preserved.)
test("one owner runs index{text} + index{image} concurrently (per-(kind, owner, source) — different slots)", async () => {
  const db = await freshDb();
  const owner = castId<UserId>("user_a");
  await db.insert(users).values({ id: owner, handle: castId<Handle>("a"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_text"),
    kind: "index",
    source: "text",
    mode: "singular",
    ownerId: owner,
  });
  // The same owner's concurrent image reindex is ALLOWED — a different source, a different singular slot.
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_image"),
    kind: "index",
    source: "image",
    mode: "singular",
    ownerId: owner,
  });
  const all = await db.select().from(workloads).where(eq(workloads.kind, "index"));
  expect(all).toHaveLength(2);
});

// The `all` reindex-everything pass is its OWN lock slot (distinct source), single-active against another all.
test("a second ACTIVE index{all} collides (same source single-active), but coexists with a distinct source", async () => {
  const db = await freshDb();
  const owner = castId<UserId>("user_a");
  await db.insert(users).values({ id: owner, handle: castId<Handle>("a"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_all1"),
    kind: "index",
    source: "all",
    mode: "singular",
    ownerId: owner,
  });
  let caught: unknown;
  try {
    await db.insert(workloads).values({
      id: castId<WorkloadId>("workload_all2"),
      kind: "index",
      source: "all",
      mode: "singular",
      ownerId: owner,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

// A SINGULAR run is NOT global — two DIFFERENT owners each hold their OWN active slot of one (kind, source).
test("two DIFFERENT owners each run their own active SINGULAR index{text} (per-owner, not global)", async () => {
  const db = await freshDb();
  const a = castId<UserId>("user_a");
  const b = castId<UserId>("user_b");
  await db.insert(users).values({ id: a, handle: castId<Handle>("a"), role: "user" });
  await db.insert(users).values({ id: b, handle: castId<Handle>("b"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_a"),
    kind: "index",
    source: "text",
    mode: "singular",
    ownerId: a,
  });
  // B's concurrent index{text} is ALLOWED — a different owner, a different singular slot.
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_b"),
    kind: "index",
    source: "text",
    mode: "singular",
    ownerId: b,
  });
  const all = await db.select().from(workloads).where(eq(workloads.kind, "index"));
  expect(all).toHaveLength(2);
});

// A SINGULAR run and a BULK run of one kind DON'T collide (different lock partitions) — an owner's dev bulk
// sweep can run alongside a user's own singular pass.
test("a SINGULAR row and a BULK row of one (kind, source) coexist (disjoint mode partitions)", async () => {
  const db = await freshDb();
  const owner = castId<UserId>("user_a");
  await db.insert(users).values({ id: owner, handle: castId<Handle>("a"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_singular"),
    kind: "index",
    source: "text",
    mode: "singular",
    ownerId: owner,
  });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_bulk"),
    kind: "index",
    source: "text",
    mode: "bulk",
  });
  const all = await db.select().from(workloads).where(eq(workloads.kind, "index"));
  expect(all).toHaveLength(2);
});

// BULK also keys on source — an index{text} bulk sweep and an index{image} bulk sweep run concurrently.
test("a BULK index{text} and a BULK index{image} coexist (per-(kind, source) bulk lock)", async () => {
  const db = await freshDb();
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_bulk_text"),
    kind: "index",
    source: "text",
    mode: "bulk",
  });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_bulk_image"),
    kind: "index",
    source: "image",
    mode: "bulk",
  });
  const all = await db.select().from(workloads).where(eq(workloads.kind, "index"));
  expect(all).toHaveLength(2);
});

test("`cancelling` still holds the slot — a queued + cancelling BULK pair of one kind collide", async () => {
  const db = await freshDb();
  await db.insert(workloads).values({ id: castId<WorkloadId>("workload_qa"), kind: "compute-themes", mode: "bulk" });

  let caught: unknown;
  try {
    await db.insert(workloads).values({
      id: castId<WorkloadId>("workload_cx"),
      kind: "compute-themes",
      mode: "bulk",
      status: "cancelling",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("TERMINAL rows do not hold the slot — a queued row coexists with cancelled + succeeded of its kind", async () => {
  const db = await freshDb();
  // Two terminal bulk rows of the same kind coexist (the index excludes non-active statuses).
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_done1"),
    kind: "find-duplicates",
    mode: "bulk",
    status: "succeeded",
  });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_done2"),
    kind: "find-duplicates",
    mode: "bulk",
    status: "cancelled",
  });
  // And a fresh active bulk row of the same kind is allowed (the slot is free).
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_fresh"),
    kind: "find-duplicates",
    mode: "bulk",
  });

  const all = await db.select().from(workloads).where(eq(workloads.kind, "find-duplicates"));
  expect(all).toHaveLength(3);
});

test("a different kind never collides (the lock is per-kind)", async () => {
  const db = await freshDb();
  await db.insert(workloads).values({ id: castId<WorkloadId>("workload_k1"), kind: "distill-characters", mode: "bulk" });
  await db.insert(workloads).values({ id: castId<WorkloadId>("workload_k2"), kind: "compute-themes", mode: "bulk" });
  const all = await db.select().from(workloads);
  expect(all).toHaveLength(2);
});
