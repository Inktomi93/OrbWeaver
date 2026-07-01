// Verb test: list — newest-first, filterable by kind/status/owner; owner-scoping is by the owner_id column.

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeService, seedUser, seedWorkloadRow, T0 } from "../_support.ts";

describe("workloads.list", () => {
  test("returns rows newest-first and filters by kind + owner", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedWorkloadRow(db, { id: "a", kind: "reconcile-stats", createdAt: T0 });
    await seedWorkloadRow(db, {
      id: "b",
      kind: "compute-themes",
      ownerId: owner,
      createdAt: T0 + 10,
    });
    const s = makeService(db);
    expect((await s.list({})).map((r) => r.id)).toEqual(["b", "a"]);
    expect((await s.list({ kind: "compute-themes" })).map((r) => r.id)).toEqual(["b"]);
    expect((await s.list({ ownerId: owner })).map((r) => r.id)).toEqual(["b"]);
  });
});
