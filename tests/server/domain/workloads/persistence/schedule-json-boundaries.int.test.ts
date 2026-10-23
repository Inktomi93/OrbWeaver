// @subject packages/server/src/domain/workloads/persistence/schedule-queries.ts
// @subject packages/server/src/domain/workloads/verbs/update-schedule.ts
// @subject packages/server/src/domain/workloads/verbs/set-schedule-enabled.ts
// @subject packages/server/src/domain/workloads/verbs/delete-schedule.ts
import type { Principal } from "@orb/contracts/identity";
import type { WorkloadScheduleRef } from "@orb/contracts/workloads";
import { CADENCE_INTERVAL_MS, workloadScheduleViewSchema } from "@orb/contracts/workloads";
import { workloadSchedules } from "@orb/db";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { WorkloadScheduleId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

async function create(harness: ServerTestHarness, caller: Principal): Promise<WorkloadScheduleRef> {
  return await harness.services.workloads.createSchedule({
    caller,
    ownerId: caller.userId,
    input: { kind: "assets-backfill", params: { dryRun: true } },
    cadence: "daily",
    mode: "singular",
  });
}
async function stored(
  harness: ServerTestHarness,
  id: WorkloadScheduleId,
): Promise<(Pick<typeof workloadSchedules.$inferSelect, "id" | "enabled" | "cadence" | "updatedAt"> & { readonly params: string })[]> {
  return await harness.db
    .select({
      id: workloadSchedules.id,
      enabled: workloadSchedules.enabled,
      cadence: workloadSchedules.cadence,
      updatedAt: workloadSchedules.updatedAt,
      params: sql<string>`${workloadSchedules.params}`,
    })
    .from(workloadSchedules)
    .where(eq(workloadSchedules.id, id));
}

for (const authority of ["owner", "admin", "system"] as const) {
  test(`${authority} management refuses malformed owned params before any update, enable flip or deletion`, async ({ harness }) => {
    const owner = await harness.principalFor((await harness.actor()).id);
    let caller: Principal | null = owner;
    if (authority === "system") {
      caller = null;
    } else if (authority === "admin") {
      caller = await harness.principalFor((await harness.actor({ role: "admin" })).id);
    }
    const row = await create(harness, owner);
    await harness.db
      .update(workloadSchedules)
      .set({ params: sql`${"false"}` })
      .where(eq(workloadSchedules.id, row.id));
    const before = await stored(harness, row.id);
    harness.clock.advance(1000);
    await expect(harness.services.workloads.updateSchedule({ caller, id: row.id, cadence: "weekly" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(harness.services.workloads.setScheduleEnabled({ caller, id: row.id, enabled: false })).rejects.toBeInstanceOf(z.ZodError);
    await expect(harness.services.workloads.deleteSchedule({ caller, id: row.id })).rejects.toBeInstanceOf(z.ZodError);
    expect(await stored(harness, row.id)).toEqual(before);
  });
}

test("foreign corrupt params and missing ids have identical management refusal with no private decode or writes", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const caller = await harness.principalFor((await harness.actor()).id);
  const row = await create(harness, owner);
  const missing = await create(harness, owner);
  await harness.services.workloads.deleteSchedule({ caller: owner, id: missing.id });
  await harness.db
    .update(workloadSchedules)
    .set({ params: sql`${"{"}` })
    .where(eq(workloadSchedules.id, row.id));
  const before = await stored(harness, row.id);
  for (const id of [row.id, missing.id]) {
    await expect(harness.services.workloads.updateSchedule({ caller, id, cadence: "weekly" })).rejects.toBeInstanceOf(DomainNotFoundError);
    await expect(harness.services.workloads.setScheduleEnabled({ caller, id, enabled: false })).rejects.toBeInstanceOf(DomainNotFoundError);
    await expect(harness.services.workloads.deleteSchedule({ caller, id })).rejects.toBeInstanceOf(DomainNotFoundError);
  }
  expect(await harness.services.workloads.listSchedules({ caller })).toEqual([]);
  expect(await stored(harness, row.id)).toEqual(before);
  await expect(harness.services.workloads.deleteSchedule({ caller: owner, id: row.id })).rejects.toBeInstanceOf(SyntaxError);
});

test("real admin and trusted system controls preserve validated foreign schedule edits and deletion", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const admin = await harness.principalFor((await harness.actor({ role: "admin" })).id);
  const row = await create(harness, owner);
  const updated = await harness.services.workloads.updateSchedule({ caller: admin, id: row.id, cadence: "weekly" });
  expect(workloadScheduleViewSchema.parse(updated)).toMatchObject({
    id: row.id,
    ownerId: owner.userId,
    params: { dryRun: true },
    cadence: "weekly",
    nextRunAt: harness.clock.now() + CADENCE_INTERVAL_MS.weekly,
  });
  expect(await harness.services.workloads.setScheduleEnabled({ caller: null, id: row.id, enabled: false })).toMatchObject({ id: row.id, enabled: false });
  await harness.services.workloads.deleteSchedule({ caller: admin, id: row.id });
  expect(await stored(harness, row.id)).toEqual([]);
});

test("an owned malformed params object is not published as a typed schedule list", async ({ harness }) => {
  const caller = await harness.principalFor((await harness.actor()).id);
  const row = await create(harness, caller);
  await harness.db
    .update(workloadSchedules)
    .set({ params: sql`${"[]"}` })
    .where(eq(workloadSchedules.id, row.id));
  await expect(harness.services.workloads.listSchedules({ caller })).rejects.toBeInstanceOf(z.ZodError);
});
