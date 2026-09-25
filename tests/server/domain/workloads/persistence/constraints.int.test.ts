// Integration test: the single-active marker predicate against a REAL unique-index violation. Two active
// BULK rows of the same kind collide at the `workloads_mode_active_bulk` partial index →
// `isActiveKindUniqueViolation` is true; a non-constraint error is false. Proves the guard (a unique collision
// IS the single-active conflict; FK/PK would classify differently and NOT be swallowed).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import { createDb, runMigrations, users, workloads } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { isActiveKindUniqueViolation } from "../../../../../packages/server/src/domain/workloads/persistence/constraints.ts";
import { insertWorkload, markStarted } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { T0 } from "../_support.ts";

const MIGRATIONS_DIR = "packages/db/src/migrations";

describe("isActiveKindUniqueViolation", () => {
  test("true for the single-active-per-kind collision", async () => {
    const db = await freshDb();
    const base = {
      kind: "reconcile-stats" as const,
      mode: "bulk" as const,
      admissionKey: "none",
      lane: "sweep" as const,
      params: {},
      ownerId: null,
      dependsOn: null,
      scheduledAt: T0,
      createdAt: T0,
    };
    await insertWorkload(db, { id: castId<WorkloadId>("workload_a"), ...base });
    let caught: unknown;
    try {
      await insertWorkload(db, { id: castId<WorkloadId>("workload_b"), ...base });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(isActiveKindUniqueViolation(caught)).toBe(true);
  });

  test("false for a non-constraint error", () => {
    expect(isActiveKindUniqueViolation(new Error("boom"))).toBe(false);
    expect(isActiveKindUniqueViolation(undefined)).toBe(false);
  });

  test("real SQLite admits exactly one concurrent NULL-owner singular row", async () => {
    const dir = mkdtempSync(join(tmpdir(), `orb-workload-null-owner-${pid}-`));
    const path = join(dir, "queue.db");
    try {
      const firstDb = await createDb(`file:${path}`);
      await runMigrations(firstDb, MIGRATIONS_DIR);
      const secondDb = await createDb(`file:${path}`);
      const base = {
        kind: "reconcile-stats" as const,
        mode: "singular" as const,
        admissionKey: "none",
        lane: "sweep" as const,
        params: {},
        ownerId: null,
        dependsOn: null,
        scheduledAt: T0,
        createdAt: T0,
      };

      const outcomes = await Promise.allSettled([
        insertWorkload(firstDb, { id: castId<WorkloadId>("workload_null_a"), ...base }),
        insertWorkload(secondDb, { id: castId<WorkloadId>("workload_null_b"), ...base }),
      ]);
      const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
      const rejected = outcomes.filter((outcome) => outcome.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(isActiveKindUniqueViolation(rejected[0]?.reason)).toBe(true);
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${path}${suffix}`, { force: true });
      }
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("real SQLite keeps concurrent system and owned admissions disjoint through owner delete and idempotent claim", async () => {
    const dir = mkdtempSync(join(tmpdir(), `orb-workload-owner-delete-${pid}-`));
    const path = join(dir, "queue.db");
    try {
      const firstDb = await createDb(`file:${path}`);
      await runMigrations(firstDb, MIGRATIONS_DIR);
      const secondDb = await createDb(`file:${path}`);
      const ownerId = castId<UserId>("user_concurrent_owned");
      const ownedId = castId<WorkloadId>("workload_concurrent_owned");
      await firstDb
        .insert(users)
        .values({ id: ownerId, handle: castId<Handle>("concurrent-owned"), handleKey: handleKey(castId<Handle>("concurrent-owned")), role: "user" });
      const base = {
        kind: "reconcile-stats" as const,
        mode: "singular" as const,
        admissionKey: "none",
        lane: "sweep" as const,
        params: {},
        dependsOn: null,
        scheduledAt: T0,
        createdAt: T0,
      };

      const admissions = await Promise.allSettled([
        insertWorkload(firstDb, { id: castId<WorkloadId>("workload_concurrent_system"), ...base, ownerId: null }),
        insertWorkload(secondDb, { id: ownedId, ...base, ownerId }),
      ]);
      expect(admissions.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);

      await firstDb.delete(users).where(eq(users.id, ownerId));
      const retained = await secondDb.select().from(workloads).where(eq(workloads.kind, "reconcile-stats"));
      expect(retained).toHaveLength(2);
      expect(retained.map((row) => row.ownerId)).toEqual([null, null]);
      expect(retained.map((row) => row.admissionSystem).sort()).toEqual([false, true]);
      expect(await markStarted(firstDb, ownedId, T0 + 1)).toBe(true);
      expect(await markStarted(secondDb, ownedId, T0 + 2)).toBe(false);
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${path}${suffix}`, { force: true });
      }
      rmSync(dir, { force: true, recursive: true });
    }
  });
});
