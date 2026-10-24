// @subject packages/server/src/domain/workloads/persistence/schedule-queries.ts
// @subject packages/server/src/domain/workloads/engine/schedule-tick.ts
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { workloadSchedules } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import { DomainNotFoundError } from "@orb/kit/errors";
import { ID_PREFIX } from "@orb/kit/ids";
import { tickWorkloadSchedules } from "@orb/server/domain/workloads";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { seedWorkloadScheduleRows } from "@orb/testkit/node/rows";
import { eq } from "drizzle-orm";

async function schedule(
  root: ServerTestHarness,
  enabled = true,
  cadence: keyof typeof CADENCE_INTERVAL_MS = "daily",
): Promise<Awaited<ReturnType<typeof seedWorkloadScheduleRows>>> {
  return await seedWorkloadScheduleRows(root, {
    caller: await root.principalFor(root.ownerId),
    ownerId: root.ownerId,
    input: { kind: "reconcile-stats", params: {} },
    mode: "singular",
    cadence,
    enabled,
  });
}

test("a production schedule insert and read project the stored fields with native identifiers", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const row = await schedule(root);
  const [read] = await root.services.workloads.listSchedules({ caller: await root.principalFor(root.ownerId), kind: "reconcile-stats" });
  expect(read).toMatchObject({ id: row.id, ownerId: root.ownerId, kind: "reconcile-stats", cadence: "daily", enabled: true, lastRunAt: null });
  expect(read?.nextRunAt).toBe(root.clock.now() + CADENCE_INTERVAL_MS.daily);
});

test("absent and foreign native schedule identifiers have the same refusal and no state effects", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const foreign = await schedule(root);
  const member = await root.actor();
  const caller = await root.principalFor(member.id);
  const before = await root.db.select().from(workloadSchedules);
  const id = root.idSource.typeId(ID_PREFIX.workloadSchedule);
  await expect(root.services.workloads.updateSchedule({ caller, id })).rejects.toBeInstanceOf(DomainNotFoundError);
  await expect(root.services.workloads.updateSchedule({ caller, id: foreign.id })).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(await root.services.workloads.listSchedules({ caller })).toEqual([]);
  expect(await root.db.select().from(workloadSchedules)).toEqual(before);
});

test("a schedule patch retunes the cadence and bumps updatedAt using the injected clock", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const row = await schedule(root);
  root.clock.advance(1);
  const patched = await root.services.workloads.updateSchedule({ caller: await root.principalFor(root.ownerId), id: row.id, cadence: "weekly" });
  expect(patched).toMatchObject({ cadence: "weekly", nextRunAt: root.clock.now() + CADENCE_INTERVAL_MS.weekly, updatedAt: root.clock.now() });
});

test("the schedule enable operation flips the persisted flag", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const row = await schedule(root);
  root.clock.advance(2);
  const off = await root.services.workloads.setScheduleEnabled({ caller: await root.principalFor(root.ownerId), id: row.id, enabled: false });
  expect(off.enabled).toBe(false);
  expect(await root.db.select().from(workloadSchedules).where(eq(workloadSchedules.id, row.id)).get()).toMatchObject({ enabled: false });
});

test("deleting a present schedule removes it; a repeated public deletion is not-found", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const row = await schedule(root);
  const caller = await root.principalFor(root.ownerId);
  await root.services.workloads.deleteSchedule({ caller, id: row.id });
  expect(await root.db.select().from(workloadSchedules).where(eq(workloadSchedules.id, row.id))).toEqual([]);
  await expect(root.services.workloads.deleteSchedule({ caller, id: row.id })).rejects.toBeInstanceOf(DomainNotFoundError);
});

test("schedule listing filters by owner while the authorized deployment view sees both", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const own = await schedule(root);
  const other = await root.actor();
  const otherPrincipal = await root.principalFor(other.id);
  const theirs = await seedWorkloadScheduleRows(root, {
    caller: otherPrincipal,
    ownerId: other.id,
    input: { kind: "reconcile-stats", params: {} },
    mode: "singular",
    cadence: "daily",
  });
  const caller = await root.principalFor(root.ownerId);
  expect((await root.services.workloads.listSchedules({ caller, ownerId: root.ownerId })).map((row) => row.id)).toEqual([own.id]);
  expect((await root.services.workloads.listSchedules({ caller })).map((row) => row.id).toSorted()).toEqual([own.id, theirs.id].toSorted());
  expect((await root.services.workloads.listSchedules({ caller: otherPrincipal })).map((row) => row.id)).toEqual([theirs.id]);
});

test("the actual tick selects only enabled due schedules, not future or disabled siblings", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const due = await schedule(root, true, "hourly");
  const disabled = await schedule(root, false, "hourly");
  const future = await schedule(root, true, "weekly");
  root.clock.advance(CADENCE_INTERVAL_MS.hourly);
  await tickWorkloadSchedules({ db: databaseHandle(root.db), now: root.clock.now, start: root.services.workloads.start });
  const jobs = await root.services.workloads.list({ caller: await root.principalFor(root.ownerId), kind: "reconcile-stats" });
  expect(jobs).toHaveLength(1);
  expect(jobs[0]).toMatchObject({ kind: due.kind, ownerId: due.ownerId, status: "queued" });
  const rows = await root.services.workloads.listSchedules({ caller: await root.principalFor(root.ownerId) });
  expect(rows.find((row) => row.id === due.id)?.lastRunAt).toBe(root.clock.now());
  expect(rows.find((row) => row.id === disabled.id)?.lastRunAt).toBeNull();
  expect(rows.find((row) => row.id === future.id)?.lastRunAt).toBeNull();
});

test("the actual tick advances the next due instant and stamps lastRunAt", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const row = await schedule(root);
  root.clock.advance(CADENCE_INTERVAL_MS.daily);
  await tickWorkloadSchedules({ db: databaseHandle(root.db), now: root.clock.now, start: root.services.workloads.start });
  const [after] = await root.services.workloads.listSchedules({ caller: await root.principalFor(root.ownerId) });
  expect(after).toMatchObject({ id: row.id, lastRunAt: root.clock.now(), nextRunAt: root.clock.now() + CADENCE_INTERVAL_MS.daily });
});
