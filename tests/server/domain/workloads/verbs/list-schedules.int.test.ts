// Verb test: listSchedules — F3 owner-scoping. A non-admin caller sees ONLY its own schedules (server
// forces the owner scope); a stranger sees none; an admin sees the deployment-wide set.

import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, principal, seedUser } from "../_support.ts";

describe("workloads.listSchedules", () => {
  test("a non-admin caller sees only its own schedules; a stranger sees none", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedUser(db, "user_bob");
    const s = makeService(db);
    await s.createSchedule({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      cadence: "daily",
      mode: "singular",
      ownerId: alice,
    });
    expect(await s.listSchedules({ caller: principal("user_alice") })).toHaveLength(1);
    expect(await s.listSchedules({ caller: principal("user_bob") })).toHaveLength(0);
  });

  test("an admin sees every owner's schedules (deployment-wide)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const bob = await seedUser(db, "user_bob");
    await seedUser(db, "user_admin", "admin");
    const s = makeService(db);
    await s.createSchedule({
      input: { kind: "index", params: { source: "text" } },
      caller: principal("user_alice"),
      cadence: "daily",
      mode: "singular",
      ownerId: alice,
    });
    await s.createSchedule({
      input: { kind: "compute-themes", params: {} },
      caller: principal("user_bob"),
      cadence: "weekly",
      mode: "singular",
      ownerId: bob,
    });
    expect(await s.listSchedules({ caller: principal("user_admin", "admin") })).toHaveLength(2);
  });
});
