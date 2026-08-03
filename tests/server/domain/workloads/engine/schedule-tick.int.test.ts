// Engine test: the scheduler TICK — a due schedule enqueues a workload + advances `nextRunAt`; a disabled
// schedule is untouched; a single-active collision (an already-active same-(kind, owner) run) is a BENIGN skip
// that STILL advances. Deterministic: a controllable `now` + a real `:memory:` db + the real `start` front door.

import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import type { Db } from "@orb/db";
import { workloadSchedules } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { tickWorkloadSchedules } from "../../../../../packages/server/src/domain/workloads/engine/schedule-tick.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService, principal, seedUser, seedWorkloadRow, T0 } from "../_support.ts";

/** Seed a schedule row directly (the tick needs arbitrary `nextRunAt`/`enabled` the verbs won't make). */
async function seedSchedule(
  db: Db,
  overrides: {
    id?: string;
    ownerId: UserId;
    nextRunAt?: number;
    enabled?: boolean;
  },
): Promise<void> {
  await db.insert(workloadSchedules).values({
    id: castId(overrides.id ?? "workload_schedule_seed"),
    ownerId: overrides.ownerId,
    kind: "reconcile-stats",
    mode: "singular",
    params: {},
    cadence: "daily",
    nextRunAt: overrides.nextRunAt ?? T0,
    enabled: overrides.enabled ?? true,
    createdAt: T0,
    updatedAt: T0,
  });
}

describe("schedule tick — due schedules enqueue + advance", () => {
  test("a due enabled schedule enqueues a workload for its owner + advances nextRunAt", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const service = makeService(db);
    await seedSchedule(db, { ownerId: alice, nextRunAt: T0 });

    const nowMs = T0 + 5;
    await tickWorkloadSchedules({ db, now: () => nowMs, start: service.start });

    // A workload was enqueued for alice (through the normal start path → owner-stamped, queued).
    const workloads = await service.list({ caller: principal("user_alice") });
    expect(workloads).toHaveLength(1);
    expect(workloads[0]?.kind).toBe("reconcile-stats");
    expect(workloads[0]?.status).toBe("queued");

    // The schedule advanced one interval out from nowMs + stamped lastRunAt.
    const [row] = await service.listSchedules({ caller: principal("user_alice") });
    expect(row?.nextRunAt).toBe(nowMs + CADENCE_INTERVAL_MS.daily);
    expect(row?.lastRunAt).toBe(nowMs);
  });

  test("a DISABLED due schedule enqueues nothing + is left untouched", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const service = makeService(db);
    await seedSchedule(db, { ownerId: alice, nextRunAt: T0, enabled: false });

    await tickWorkloadSchedules({ db, now: () => T0 + 5, start: service.start });

    expect(await service.list({ caller: principal("user_alice") })).toHaveLength(0);
    const [row] = await service.listSchedules({ caller: principal("user_alice") });
    expect(row?.nextRunAt).toBe(T0); // unchanged — the tick never saw it
    expect(row?.lastRunAt).toBeNull();
  });

  test("a NOT-yet-due schedule is skipped (nextRunAt in the future)", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const service = makeService(db);
    await seedSchedule(db, { ownerId: alice, nextRunAt: T0 + 1_000_000 });

    await tickWorkloadSchedules({ db, now: () => T0, start: service.start });

    expect(await service.list({ caller: principal("user_alice") })).toHaveLength(0);
  });

  test("a single-active collision is a benign skip that STILL advances the schedule", async () => {
    const db = await freshDb();
    const alice = await seedUser(db, "user_alice");
    const service = makeService(db);
    // An already-active singular reconcile-stats run for alice HOLDS the (kind, owner, source) slot.
    await seedWorkloadRow(db, {
      id: "workload_active",
      kind: "reconcile-stats",
      status: "running",
      mode: "singular",
      ownerId: alice,
    });
    await seedSchedule(db, { ownerId: alice, nextRunAt: T0 });

    const nowMs = T0 + 5;
    await tickWorkloadSchedules({ db, now: () => nowMs, start: service.start });

    // No SECOND run was enqueued (the lock rejected it → DomainConflictError → benign skip).
    const workloads = await service.list({ caller: principal("user_alice") });
    expect(workloads).toHaveLength(1);
    expect(workloads[0]?.id).toBe(castId("workload_active"));
    // But the schedule STILL advanced (the desired "one active run" already holds).
    const [row] = await service.listSchedules({ caller: principal("user_alice") });
    expect(row?.nextRunAt).toBe(nowMs + CADENCE_INTERVAL_MS.daily);
    expect(row?.lastRunAt).toBe(nowMs);
  });
});
