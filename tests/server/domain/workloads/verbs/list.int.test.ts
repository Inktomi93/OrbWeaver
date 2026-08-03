// Verb test: list — newest-first, filterable by kind/status/owner; owner-scoping is by the owner_id column.

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, principal, seedUser, seedWorkloadRow, T0 } from "../_support.ts";

describe("workloads.list", () => {
  test("returns rows newest-first and filters by kind + owner (system caller)", async () => {
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
    expect((await s.list({ caller: null })).map((r) => r.id)).toEqual(["b", "a"]);
    expect((await s.list({ caller: null, kind: "compute-themes" })).map((r) => r.id)).toEqual(["b"]);
    expect((await s.list({ caller: null, ownerId: owner })).map((r) => r.id)).toEqual(["b"]);
  });

  // ── F3 authz ──
  test("a normal user sees ONLY its own workloads; an admin sees ALL owners", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const bob = await seedUser(db, "user_bob");
    await seedWorkloadRow(db, { id: "w_alice", kind: "distill-characters", ownerId: alice });
    await seedWorkloadRow(db, { id: "w_bob", kind: "compute-themes", ownerId: bob });
    await seedWorkloadRow(db, { id: "w_system", kind: "reconcile-stats", ownerId: null });
    const s = makeService(db);

    // Alice sees ONLY her own — not bob's, not the system row (a supplied foreign filter is ignored).
    expect((await s.list({ caller: principal("user_alice") })).map((r) => r.id)).toEqual(["w_alice"]);
    // An admin sees every owner (the deployment-wide view).
    expect((await s.list({ caller: principal("user_admin", "admin") })).map((r) => r.id).sort()).toEqual(["w_alice", "w_bob", "w_system"]);
  });
});
