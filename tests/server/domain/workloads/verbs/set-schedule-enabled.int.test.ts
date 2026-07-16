// Verb test: setScheduleEnabled — flips the enabled flag; F3 owner-scoping (a stranger toggling owner A's
// schedule → leak-free NOT_FOUND, no mutation).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadScheduleId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeService, principal, seedUser } from "../_support.ts";

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

describe("workloads.setScheduleEnabled", () => {
  test("flips the enabled flag", async () => {
    const db = await freshDb();
    const id = await seedAliceSchedule(db);
    const s = makeService(db);
    const disabled = await s.setScheduleEnabled({
      id,
      caller: principal("user_alice"),
      enabled: false,
    });
    expect(disabled.enabled).toBe(false);
    const reEnabled = await s.setScheduleEnabled({
      id,
      caller: principal("user_alice"),
      enabled: true,
    });
    expect(reEnabled.enabled).toBe(true);
  });

  test("a stranger toggling owner A's schedule → leak-free NOT_FOUND, no mutation", async () => {
    const db = await freshDb();
    const id = await seedAliceSchedule(db);
    await seedUser(db, "user_bob");
    const s = makeService(db);
    await expect(s.setScheduleEnabled({ id, caller: principal("user_bob"), enabled: false })).rejects.toBeInstanceOf(DomainNotFoundError);
    const [still] = await s.listSchedules({ caller: principal("user_alice") });
    expect(still?.enabled).toBe(true); // untouched
  });
});
