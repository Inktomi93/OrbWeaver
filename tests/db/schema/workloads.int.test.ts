// .int test for schema/workloads: the test-mirror (db enum === contracts tuple, D34), a JSON round-trip,
// the nullable ownerId FK, and the load-bearing single-active partial unique indexes (the MODE model: a BULK
// run locks GLOBAL on `workloads_mode_active_bulk` (kind); a SINGULAR run locks PER-OWNER on
// `workloads_mode_active_singular` (kind, owner_id) so two users each run their own instance — the WHERE
// status list derives from ACTIVE_WORKLOAD_STATUSES; the partition is the `mode` column). Real libSQL
// :memory: via freshDb (FK ON).

import {
  ACTIVE_WORKLOAD_STATUSES,
  WORKLOAD_KINDS,
  WORKLOAD_MODES,
  WORKLOAD_STATUSES,
} from "@orb/contracts/workloads";
import { isConstraintViolation, users, workloads } from "@orb/db";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
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

// The index WHERE list is derived from ACTIVE_WORKLOAD_STATUSES — assert the active subset is what the
// behavioral lock test below relies on (the named mirror of the partial-index predicate).
test("ACTIVE_WORKLOAD_STATUSES is the [queued, running, cancelling] slot-holder set the index keys on", () => {
  expect([...ACTIVE_WORKLOAD_STATUSES]).toEqual(["queued", "running", "cancelling"]);
});

// ── Round-trip: branded id, kind, default status + mode, JSON params/result ────────────────────────────
test("workloads insert→select round-trips (defaults status=queued + mode=singular, JSON params)", async () => {
  const db = await freshDb();
  const id = castId<WorkloadId>("workload_roundtrip");
  await db.insert(workloads).values({
    id,
    kind: "embed-corpus",
    params: { characterId: "character_x" },
  });

  const rows = await db.select().from(workloads).where(eq(workloads.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.kind).toBe("embed-corpus");
  expect(rows[0]?.status).toBe("queued"); // the column default
  expect(rows[0]?.mode).toBe("singular"); // the column default
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
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_q1"), kind: "reconcile-stats", mode: "bulk" });

  let caught: unknown;
  try {
    await db
      .insert(workloads)
      .values({ id: castId<WorkloadId>("workload_q2"), kind: "reconcile-stats", mode: "bulk" });
  } catch (err) {
    caught = err;
  }
  const violation = isConstraintViolation(caught);
  expect(violation).toBeDefined();
  expect(violation?.kind).toBe("unique");
});

// A SINGULAR run locks PER-OWNER — the SAME owner can't hold two active slots of one kind.
test("a second ACTIVE SINGULAR row + SAME owner collides (embed-corpus per (kind, owner))", async () => {
  const db = await freshDb();
  const owner = castId<UserId>("user_a");
  await db.insert(users).values({ id: owner, handle: castId<Handle>("a"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_a1"),
    kind: "embed-corpus",
    mode: "singular",
    ownerId: owner,
  });

  let caught: unknown;
  try {
    await db.insert(workloads).values({
      id: castId<WorkloadId>("workload_a2"),
      kind: "embed-corpus",
      mode: "singular",
      ownerId: owner,
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

// A SINGULAR run is NOT global — two DIFFERENT owners each hold their OWN active slot of one kind (the core:
// two users run their own embed-corpus concurrently).
test("two DIFFERENT owners each run their own active SINGULAR row (per-owner, not global)", async () => {
  const db = await freshDb();
  const a = castId<UserId>("user_a");
  const b = castId<UserId>("user_b");
  await db.insert(users).values({ id: a, handle: castId<Handle>("a"), role: "user" });
  await db.insert(users).values({ id: b, handle: castId<Handle>("b"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_a"),
    kind: "embed-corpus",
    mode: "singular",
    ownerId: a,
  });
  // B's concurrent embed-corpus is ALLOWED — a different owner, a different singular slot.
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_b"),
    kind: "embed-corpus",
    mode: "singular",
    ownerId: b,
  });
  const all = await db.select().from(workloads).where(eq(workloads.kind, "embed-corpus"));
  expect(all).toHaveLength(2);
});

// A SINGULAR run and a BULK run of one kind DON'T collide (different lock partitions) — an owner's dev bulk
// sweep can run alongside a user's own singular pass.
test("a SINGULAR row and a BULK row of one kind coexist (disjoint mode partitions)", async () => {
  const db = await freshDb();
  const owner = castId<UserId>("user_a");
  await db.insert(users).values({ id: owner, handle: castId<Handle>("a"), role: "user" });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_singular"),
    kind: "embed-corpus",
    mode: "singular",
    ownerId: owner,
  });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_bulk"),
    kind: "embed-corpus",
    mode: "bulk",
  });
  const all = await db.select().from(workloads).where(eq(workloads.kind, "embed-corpus"));
  expect(all).toHaveLength(2);
});

test("`cancelling` still holds the slot — a queued + cancelling BULK pair of one kind collide", async () => {
  const db = await freshDb();
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_qa"), kind: "compute-themes", mode: "bulk" });

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
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_k1"), kind: "embed-corpus", mode: "bulk" });
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_k2"), kind: "embed-assets", mode: "bulk" });
  const all = await db.select().from(workloads);
  expect(all).toHaveLength(2);
});
