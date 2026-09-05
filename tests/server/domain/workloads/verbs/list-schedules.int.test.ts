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

  // TOTAL ORDER (test-determinism): schedules created in one instant tie on `createdAt`, so without the id
  // tiebreak the cadence list re-shuffles between reads of an unchanged set. `id DESC` continues
  // newest-first (TypeIDs are uuidv7-backed).
  test("schedules sharing a createdAt come back in a stable total order (newest id first)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db);
    // Minted in ASCENDING id order (workload_schedule_1, _2, _3) — the reverse of the expected order.
    for (const cadence of ["daily", "weekly", "hourly"] as const) {
      await s.createSchedule({
        input: { kind: "compute-themes", params: {} },
        caller: principal("user_alice"),
        cadence,
        mode: "singular",
        ownerId: alice,
      });
    }

    const listed = await s.listSchedules({ caller: principal("user_alice") });
    expect(listed.map((row) => row.id)).toEqual(["workload_schedule_3", "workload_schedule_2", "workload_schedule_1"]);
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
