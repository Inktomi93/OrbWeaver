// @subject packages/server/src/domain/workloads/substrate/authorize.ts
// @subject packages/server/src/domain/workloads/verbs/cancel.ts
// @subject packages/server/src/domain/workloads/verbs/retry.ts
// @subject packages/server/src/domain/workloads/verbs/estimate-model-calls.ts
// @subject packages/server/src/domain/workloads/verbs/update-schedule.ts
// @subject packages/server/src/domain/workloads/verbs/set-schedule-enabled.ts
// @subject packages/server/src/domain/workloads/verbs/delete-schedule.ts
// Only the box owner acts on the box owner's work (D17): through the workloads router a delegated admin cannot cancel,
// retry, retune, pause or delete a run or schedule the owner owns or funds, and is answered exactly as for an id nobody
// holds. The delegate still sees those rows, the owner acts on its own, and the delegate still acts on a member's.

import type { StartWorkloadInput } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const STATS = { kind: "reconcile-stats", params: {} } satisfies StartWorkloadInput;

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

async function callers(
  root: ServerTestHarness,
): Promise<{ readonly owner: Caller; readonly admin: Caller; readonly member: Caller; readonly memberId: UserId }> {
  const delegate = await root.actor({ role: "admin" });
  const member = await root.actor();
  return {
    owner: await root.internalCallerFor(root.ownerId),
    admin: await root.internalCallerFor(delegate.id),
    member: await root.internalCallerFor(member.id),
    memberId: member.id,
  };
}

// The refusal on a held id must read as the refusal on an id nobody holds, so it says nothing about whose the row is.
async function expectReadsAsMissing<Id extends string>(refuse: (id: Id) => Promise<unknown>, held: Id, missing: Id): Promise<void> {
  const refused = await refuse(held).catch((error: unknown) => error);
  const absent = await refuse(missing).catch((error: unknown) => error);
  expect(refused).toMatchObject({ code: "NOT_FOUND" });
  expect(absent).toMatchObject({ code: "NOT_FOUND" });
  expect(String(refused).replace(held, missing)).toBe(String(absent));
}

test("a delegated admin cannot cancel the owner's run or the owner's bulk sweep, the owner can, and the delegate cancels a member's", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, admin, member } = await callers(root);
  const ownerRun = await owner.workloads.start({ input: STATS });
  const sweep = await owner.workloads.start({ input: STATS, mode: "bulk" });
  const missing = root.idSource.typeId(ID_PREFIX.workload);

  for (const held of [ownerRun.id, sweep.id]) {
    await expectReadsAsMissing((id) => admin.workloads.cancel({ id }), held, missing);
  }
  expect(await admin.workloads.get({ id: ownerRun.id })).toMatchObject({ ownerId: root.ownerId, status: "queued" });
  expect(await admin.workloads.get({ id: sweep.id })).toMatchObject({ ownerId: null, funderUserId: root.ownerId, status: "queued" });

  const memberRun = await member.workloads.start({ input: STATS });
  expect(await admin.workloads.cancel({ id: memberRun.id })).toEqual({ status: "cancelled" });
  expect(await owner.workloads.cancel({ id: ownerRun.id })).toEqual({ status: "cancelled" });
  expect(await owner.workloads.cancel({ id: sweep.id })).toEqual({ status: "cancelled" });
});

test("a delegated admin cannot retry the owner's run or ask its size, the owner can, and the delegate retries a member's", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, admin, member, memberId } = await callers(root);
  const ownerRun = await owner.workloads.start({ input: STATS });
  await owner.workloads.cancel({ id: ownerRun.id });
  const memberRun = await member.workloads.start({ input: STATS });
  await member.workloads.cancel({ id: memberRun.id });
  const missing = root.idSource.typeId(ID_PREFIX.workload);

  await expectReadsAsMissing((id) => admin.workloads.retry({ id }), ownerRun.id, missing);
  await expectReadsAsMissing((id) => admin.workloads.estimateRetryModelCalls({ id }), ownerRun.id, missing);
  const ownerRows = async (): Promise<readonly string[]> => (await owner.workloads.list({})).filter((row) => row.ownerId === root.ownerId).map((row) => row.id);
  expect(await ownerRows()).toEqual([ownerRun.id]);

  expect(await admin.workloads.estimateRetryModelCalls({ id: memberRun.id })).toEqual({ calls: null, bound: "exact" });
  const memberClone = await admin.workloads.retry({ id: memberRun.id });
  expect(await member.workloads.get({ id: memberClone.id })).toMatchObject({ ownerId: memberId, status: "queued" });
  const ownerClone = await owner.workloads.retry({ id: ownerRun.id });
  expect(await ownerRows()).toEqual(expect.arrayContaining([ownerRun.id, ownerClone.id]));
});

test("a delegated admin cannot retune the owner's schedule, the owner can, and the delegate retunes a member's", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, admin, member } = await callers(root);
  const ownerSchedule = await owner.workloads.createSchedule({ input: STATS, cadence: "daily" });
  const memberSchedule = await member.workloads.createSchedule({ input: STATS, cadence: "daily" });
  const missing = root.idSource.typeId(ID_PREFIX.workloadSchedule);

  await expectReadsAsMissing((id) => admin.workloads.updateSchedule({ id, cadence: "weekly" }), ownerSchedule.id, missing);
  expect(await admin.workloads.listSchedules({})).toEqual(expect.arrayContaining([expect.objectContaining({ id: ownerSchedule.id, cadence: "daily" })]));

  expect(await admin.workloads.updateSchedule({ id: memberSchedule.id, cadence: "weekly" })).toMatchObject({ id: memberSchedule.id, cadence: "weekly" });
  expect(await owner.workloads.updateSchedule({ id: ownerSchedule.id, cadence: "weekly" })).toMatchObject({ id: ownerSchedule.id, cadence: "weekly" });
});

test("a delegated admin cannot pause the owner's schedule, the owner can, and the delegate pauses a member's", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, admin, member } = await callers(root);
  const ownerSchedule = await owner.workloads.createSchedule({ input: STATS, cadence: "daily" });
  const memberSchedule = await member.workloads.createSchedule({ input: STATS, cadence: "daily" });
  const missing = root.idSource.typeId(ID_PREFIX.workloadSchedule);

  await expectReadsAsMissing((id) => admin.workloads.setScheduleEnabled({ id, enabled: false }), ownerSchedule.id, missing);
  expect(await admin.workloads.listSchedules({})).toEqual(expect.arrayContaining([expect.objectContaining({ id: ownerSchedule.id, enabled: true })]));

  expect(await admin.workloads.setScheduleEnabled({ id: memberSchedule.id, enabled: false })).toMatchObject({ id: memberSchedule.id, enabled: false });
  expect(await owner.workloads.setScheduleEnabled({ id: ownerSchedule.id, enabled: false })).toMatchObject({ id: ownerSchedule.id, enabled: false });
});

test("a delegated admin cannot delete the owner's schedule, the owner can, and the delegate deletes a member's", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, admin, member } = await callers(root);
  const ownerSchedule = await owner.workloads.createSchedule({ input: STATS, cadence: "daily" });
  const memberSchedule = await member.workloads.createSchedule({ input: STATS, cadence: "daily" });
  const missing = root.idSource.typeId(ID_PREFIX.workloadSchedule);
  const listed = async (): Promise<readonly string[]> => (await admin.workloads.listSchedules({})).map((schedule) => schedule.id);

  await expectReadsAsMissing((id) => admin.workloads.deleteSchedule({ id }), ownerSchedule.id, missing);
  expect(await listed()).toEqual(expect.arrayContaining([ownerSchedule.id, memberSchedule.id]));

  await admin.workloads.deleteSchedule({ id: memberSchedule.id });
  await owner.workloads.deleteSchedule({ id: ownerSchedule.id });
  expect(await listed()).toEqual([]);
});
