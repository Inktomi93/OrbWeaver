// Integration test: the single-active marker predicate against a REAL unique-index violation. Two active
// rows of the same kind collide at the `workloads_kind_active` partial index → `isActiveKindUniqueViolation`
// is true; a non-constraint error is false. Proves the §"Resolved decisions" guard (a unique collision IS
// the single-active conflict; FK/PK would classify differently and NOT be swallowed).

import type { WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { isActiveKindUniqueViolation } from "../../../../../packages/server/src/domain/workloads/persistence/constraints.ts";
import { insertWorkload } from "../../../../../packages/server/src/domain/workloads/persistence/queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { T0 } from "../_support.ts";

describe("isActiveKindUniqueViolation", () => {
  test("true for the single-active-per-kind collision", async () => {
    const db = await freshDb();
    const base = {
      kind: "reconcile-stats" as const,
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
});
