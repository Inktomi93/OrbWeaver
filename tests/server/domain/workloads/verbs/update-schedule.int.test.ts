// Verb test: updateSchedule — retune cadence/params/mode; a cadence change re-bases nextRunAt; F3
// owner-scoping (a stranger updating owner A's schedule → leak-free NOT_FOUND, no mutation); admin sees all.

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadScheduleId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeService, principal, seedUser, T0 } from "../_support.ts";

async function seedAliceSchedule(db: Parameters<typeof makeService>[0]): Promise<WorkloadScheduleId> {
  const alice = await seedUser(db, "user_alice");
  const s = makeService(db);
  const { id } = await s.createSchedule({
    input: { kind: "index", params: { source: "text" } },
    caller: principal("user_alice"),
    cadence: "daily",
    mode: "singular",
    ownerId: alice,
  });
  return id;
}

describe("workloads.updateSchedule", () => {
  test("updating the cadence re-bases nextRunAt to one new interval out", async () => {
    const db = await freshDb();
    const id = await seedAliceSchedule(db);
    const s = makeService(db);
    const updated = await s.updateSchedule({
      id,
      caller: principal("user_alice"),
      cadence: "weekly",
    });
    expect(updated.cadence).toBe("weekly");
    expect(updated.nextRunAt).toBe(T0 + CADENCE_INTERVAL_MS.weekly);
  });

  test("a stranger updating owner A's schedule → leak-free NOT_FOUND, no mutation", async () => {
    const db = await freshDb();
    const id = await seedAliceSchedule(db);
    await seedUser(db, "user_bob");
    const s = makeService(db);
    await expect(s.updateSchedule({ id, caller: principal("user_bob"), cadence: "weekly" })).rejects.toBeInstanceOf(DomainNotFoundError);
    const [still] = await s.listSchedules({ caller: principal("user_alice") });
    expect(still?.cadence).toBe("daily"); // untouched
  });

  test("an admin can update any owner's schedule (owner or admin scope)", async () => {
    const db = await freshDb();
    const id = await seedAliceSchedule(db);
    await seedUser(db, "user_admin", "admin");
    const s = makeService(db);
    const updated = await s.updateSchedule({
      id,
      caller: principal("user_admin", "admin"),
      cadence: "monthly",
    });
    expect(updated.cadence).toBe("monthly");
  });
});
