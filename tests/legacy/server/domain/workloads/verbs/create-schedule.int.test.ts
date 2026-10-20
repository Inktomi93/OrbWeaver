// Verb test: createSchedule — creates a recurring schedule (the TIME dimension); the MODE gate (bulk =
// box-owner-only); the first run is one cadence-interval out. Deterministic: frozen T0 + a sequential minter.
// @subject packages/server/src/domain/workloads/verbs/create-schedule.ts

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { DomainForbiddenError, DomainOperationError } from "@orb/kit/errors";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { makeService, principal, seedUser, T0 } from "../_support.ts";

describe("workloads.createSchedule", () => {
  test("creates a singular schedule owned by the caller, first run one interval out", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db);
    const { id } = await s.createSchedule({
      input: { kind: "index", params: { source: "text" } },
      caller: await principal(db, "user_alice"),
      cadence: "daily",
      mode: "singular",
      ownerId: alice,
    });
    const [row] = await s.listSchedules({ caller: await principal(db, "user_alice") });
    expect(row?.id).toBe(id);
    expect(row?.ownerId).toBe(alice);
    expect(row?.kind).toBe("index");
    expect(row?.cadence).toBe("daily");
    expect(row?.enabled).toBe(true);
    expect(row?.nextRunAt).toBe(T0 + CADENCE_INTERVAL_MS.daily);
    expect(row?.lastRunAt).toBeNull();
  });

  test("a normal user creating a BULK schedule is REFUSED (owner-only)", async () => {
    const db = await freshDb();
    await seedUser(db, "user_alice");
    const s = makeService(db);
    await expect(
      s.createSchedule({
        input: { kind: "index", params: { source: "text" } },
        caller: await principal(db, "user_alice"),
        cadence: "weekly",
        mode: "bulk",
        ownerId: (await principal(db, "user_alice")).userId,
      }),
    ).rejects.toBeInstanceOf(DomainForbiddenError);
  });

  test("the BOX OWNER can create a BULK schedule", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner_box", "owner");
    const s = makeService(db);
    const { id } = await s.createSchedule({
      input: { kind: "reconcile-stats", params: {} },
      caller: await principal(db, "user_owner_box", "owner"),
      cadence: "weekly",
      mode: "bulk",
      ownerId: owner,
    });
    const [row] = await s.listSchedules({ caller: await principal(db, "user_owner_box", "owner") });
    expect(row?.id).toBe(id);
    expect(row?.mode).toBe("bulk");
  });

  test("a BULK-ONLY kind scheduled singular → unsupported_mode", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const s = makeService(db);
    await expect(
      s.createSchedule({
        input: { kind: "refresh-model-catalog", params: {} },
        caller: await principal(db, "user_alice"),
        cadence: "daily",
        mode: "singular",
        ownerId: alice,
      }),
    ).rejects.toBeInstanceOf(DomainOperationError);
  });
});
