// Persistence test: schedule-queries — the raw `workload_schedules` access (insert/load/list/patch/enable/
// delete + the DUE selection + the ADVANCE). Real libSQL `:memory:` via freshDb (FK ON). Determinism: fixed T0.

import type { UserId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  advanceSchedule,
  deleteScheduleRow,
  findDueSchedules,
  insertSchedule,
  listSchedulesQuery,
  loadSchedule,
  setScheduleEnabledQuery,
  updateScheduleFields,
} from "../../../../../packages/server/src/domain/workloads/persistence/schedule-queries.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedUser, T0 } from "../_support.ts";

const SCHEDULE_ID = castId<WorkloadScheduleId>("workload_schedule_1");

async function seedOne(
  db: Parameters<typeof insertSchedule>[0],
  ownerId: UserId,
  over: { nextRunAt?: number; enabled?: boolean } = {},
): Promise<void> {
  await insertSchedule(db, {
    id: SCHEDULE_ID,
    ownerId,
    kind: "reconcile-stats",
    mode: "singular",
    params: {},
    cadence: "daily",
    nextRunAt: over.nextRunAt ?? T0,
    enabled: over.enabled ?? true,
    createdAt: T0,
  });
}

describe("schedule-queries — CRUD round-trip", () => {
  test("insert → load projects the stored fields", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedOne(db, alice);
    const row = await loadSchedule(db, SCHEDULE_ID);
    expect(row?.ownerId).toBe(alice);
    expect(row?.kind).toBe("reconcile-stats");
    expect(row?.cadence).toBe("daily");
    expect(row?.enabled).toBe(true);
    expect(row?.lastRunAt).toBeNull();
  });

  test("load of an absent id → null", async () => {
    const db = await freshDb();
    expect(
      await loadSchedule(db, castId<WorkloadScheduleId>("workload_schedule_ghost")),
    ).toBeNull();
  });

  test("updateScheduleFields patches + bumps updatedAt", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedOne(db, alice);
    const updated = await updateScheduleFields(
      db,
      SCHEDULE_ID,
      { cadence: "weekly", nextRunAt: T0 + 999 },
      T0 + 1,
    );
    expect(updated?.cadence).toBe("weekly");
    expect(updated?.nextRunAt).toBe(T0 + 999);
    expect(updated?.updatedAt).toBe(T0 + 1);
  });

  test("setScheduleEnabledQuery flips the flag", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedOne(db, alice);
    const off = await setScheduleEnabledQuery(db, SCHEDULE_ID, false, T0 + 2);
    expect(off?.enabled).toBe(false);
  });

  test("deleteScheduleRow removes it (returns true), then false", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedOne(db, alice);
    expect(await deleteScheduleRow(db, SCHEDULE_ID)).toBe(true);
    expect(await deleteScheduleRow(db, SCHEDULE_ID)).toBe(false);
  });

  test("listSchedulesQuery filters by owner", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const bob = await seedUser(db, "user_bob");
    await seedOne(db, alice);
    await insertSchedule(db, {
      id: castId<WorkloadScheduleId>("workload_schedule_2"),
      ownerId: bob,
      kind: "reconcile-stats",
      mode: "singular",
      params: {},
      cadence: "daily",
      nextRunAt: T0,
      enabled: true,
      createdAt: T0,
    });
    expect(await listSchedulesQuery(db, { ownerId: alice })).toHaveLength(1);
    expect(await listSchedulesQuery(db, {})).toHaveLength(2);
  });
});

describe("schedule-queries — the tick's DUE + ADVANCE physics", () => {
  test("findDueSchedules returns enabled rows with nextRunAt <= now (skips future + disabled)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    // Due + enabled.
    await seedOne(db, alice, { nextRunAt: T0 });
    // Disabled (due but off).
    await insertSchedule(db, {
      id: castId<WorkloadScheduleId>("workload_schedule_off"),
      ownerId: alice,
      kind: "reconcile-stats",
      mode: "singular",
      params: {},
      cadence: "daily",
      nextRunAt: T0,
      enabled: false,
      createdAt: T0,
    });
    // Future (enabled but not due).
    await insertSchedule(db, {
      id: castId<WorkloadScheduleId>("workload_schedule_future"),
      ownerId: alice,
      kind: "reconcile-stats",
      mode: "singular",
      params: {},
      cadence: "daily",
      nextRunAt: T0 + 1_000_000,
      enabled: true,
      createdAt: T0,
    });
    const due = await findDueSchedules(db, T0 + 5);
    expect(due.map((r) => r.id)).toEqual([SCHEDULE_ID]);
  });

  test("advanceSchedule stamps the next due instant + lastRunAt", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    await seedOne(db, alice, { nextRunAt: T0 });
    await advanceSchedule(db, SCHEDULE_ID, T0 + 100, T0 + 5);
    const row = await loadSchedule(db, SCHEDULE_ID);
    expect(row?.nextRunAt).toBe(T0 + 100);
    expect(row?.lastRunAt).toBe(T0 + 5);
  });
});
