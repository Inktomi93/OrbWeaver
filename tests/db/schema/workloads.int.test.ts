// .int test for schema/workloads: the test-mirror (db enum === contracts tuple, D34), a JSON round-trip,
// the nullable ownerId FK, and the load-bearing `workloads_kind_active` partial unique index (the
// single-active-per-kind lock + its ACTIVE_WORKLOAD_STATUSES-derived WHERE). Real libSQL :memory: via
// freshDb (FK enforcement ON).

import {
  ACTIVE_WORKLOAD_STATUSES,
  WORKLOAD_KINDS,
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

// The index WHERE list is derived from ACTIVE_WORKLOAD_STATUSES — assert the active subset is what the
// behavioral lock test below relies on (the named mirror of the partial-index predicate).
test("ACTIVE_WORKLOAD_STATUSES is the [queued, running, cancelling] slot-holder set the index keys on", () => {
  expect([...ACTIVE_WORKLOAD_STATUSES]).toEqual(["queued", "running", "cancelling"]);
});

// ── Round-trip: branded id, kind, default status, JSON params/result ──────────────────────────────────
test("workloads insert→select round-trips (branded id, kind enum, default status=queued, JSON params)", async () => {
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

  // Owned row
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_owned"),
    kind: "reconcile-stats",
    ownerId,
  });
  // System row (null owner)
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

// ── The single-active-per-kind partial unique index (the cross-replica lock) ──────────────────────────
test("a second ACTIVE row of the same kind collides on workloads_kind_active (queued vs queued)", async () => {
  const db = await freshDb();
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_q1"), kind: "embed-corpus" }); // status=queued

  let caught: unknown;
  try {
    await db
      .insert(workloads)
      .values({ id: castId<WorkloadId>("workload_q2"), kind: "embed-corpus" });
  } catch (err) {
    caught = err;
  }
  const violation = isConstraintViolation(caught);
  expect(violation).toBeDefined();
  expect(violation?.kind).toBe("unique");
});

test("`cancelling` still holds the slot — queued + cancelling of one kind collide (cancelling IS active)", async () => {
  const db = await freshDb();
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_qa"), kind: "compute-themes" });

  let caught: unknown;
  try {
    await db.insert(workloads).values({
      id: castId<WorkloadId>("workload_cx"),
      kind: "compute-themes",
      status: "cancelling",
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("TERMINAL rows do not hold the slot — a queued row coexists with cancelled + succeeded of its kind", async () => {
  const db = await freshDb();
  // Two terminal rows of the same kind coexist (the index excludes non-active statuses).
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_done1"),
    kind: "find-duplicates",
    status: "succeeded",
  });
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_done2"),
    kind: "find-duplicates",
    status: "cancelled",
  });
  // And a fresh active row of the same kind is allowed (the slot is free).
  await db.insert(workloads).values({
    id: castId<WorkloadId>("workload_fresh"),
    kind: "find-duplicates",
  });

  const all = await db.select().from(workloads).where(eq(workloads.kind, "find-duplicates"));
  expect(all).toHaveLength(3);
});

test("a different kind never collides (the lock is per-kind)", async () => {
  const db = await freshDb();
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_k1"), kind: "embed-corpus" });
  await db
    .insert(workloads)
    .values({ id: castId<WorkloadId>("workload_k2"), kind: "embed-assets" });
  const all = await db.select().from(workloads);
  expect(all).toHaveLength(2);
});
