// Integration test: the single-active marker predicate against a REAL unique-index violation. Two active
// BULK rows of the same kind collide at the `workloads_mode_active_bulk` partial index →
// `isActiveKindUniqueViolation` is true; a non-constraint error is false. Proves the guard (a unique collision
// IS the single-active conflict; FK/PK would classify differently and NOT be swallowed).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import { createDb, runMigrations } from "@orb/db";
import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { isActiveKindUniqueViolation } from "../../../../../packages/server/src/domain/workloads/persistence/constraints.ts";
import { insertWorkload } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
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
});
