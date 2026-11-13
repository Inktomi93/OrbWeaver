// @subject packages/client/src/features/workloads/components/workloads-jobs-section.tsx
// @subject packages/client/src/features/workloads/components/schedules-section.tsx
// @subject packages/client/src/features/workloads/lib/workloads-model.ts
// A delegated admin sees the box owner's runs and schedules but is offered none of their controls (D17): no Cancel or
// Retry on a run, no switch, Edit or Delete on a schedule. The same viewer keeps every control on a member's rows.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { WORKLOAD_KIND_LABELS } from "#client/features/workloads/lib/workloads-model.ts";
import { cancelWorkloadName, retryWorkloadName } from "#client/features/workloads/lib/workloads-names.ts";
import type { ScheduleIdentity } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import { scheduleDeleteName, scheduleEditName, scheduleEnabledSwitchName, scheduleName } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";

const STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";
const STATS = { kind: "reconcile-stats", params: {} } satisfies StartWorkloadInput;
const READS = [
  "settings.getUserSettings",
  "sessions.me",
  "workloads.list",
  "workloads.get",
  "workloads.listSchedules",
  "admin.listUsers",
  "connection.listBindings",
  "connection.list",
  "stream.attach",
  "stream.detach",
] as const;

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

async function delegateView(root: ServerTestHarness): Promise<{
  readonly owner: Caller;
  readonly member: Caller;
  readonly admin: Caller;
  readonly ownerHandle: string;
  readonly memberHandle: string;
}> {
  const delegate = await root.actor({ role: "admin" });
  const member = await root.actor();
  const admin = await root.internalCallerFor(delegate.id);
  const ownerHandle = (await admin.admin.listUsers()).find((user) => user.id === root.ownerId)?.handle;
  if (ownerHandle === undefined) {
    throw new Error("the admin user list names the box owner");
  }
  return {
    owner: await root.internalCallerFor(root.ownerId),
    member: await root.internalCallerFor(member.id),
    admin,
    ownerHandle,
    memberHandle: member.handle,
  };
}

test("a delegated admin is offered Cancel and Retry on a member's runs and on none of the box owner's", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, member, admin, ownerHandle, memberHandle } = await delegateView(root);
  for (const caller of [owner, member]) {
    const ended = await caller.workloads.start({ input: STATS });
    await caller.workloads.cancel({ id: ended.id });
    await caller.workloads.start({ input: STATS });
  }
  await routeTrpc(page, serveCorpusProcedures(admin, READS));
  await routeOrbSocket(page, { awaitAttaches: 2 });
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  // Each row names its owner's handle once the admin user list answers, which is also what names the box owner.
  const rowsOf = (handle: string): ReturnType<typeof page.locator> => page.locator('[data-slot="workload-row"]').filter({ hasText: handle });
  const memberRows = rowsOf(memberHandle);
  await expect(memberRows).toHaveCount(2);
  await expect(memberRows.getByRole("button", { name: cancelWorkloadName(WORKLOAD_KIND_LABELS[STATS.kind]), exact: true })).toHaveCount(1);
  await expect(memberRows.getByRole("button", { name: retryWorkloadName(WORKLOAD_KIND_LABELS[STATS.kind]), exact: true })).toHaveCount(1);
  const ownerRows = rowsOf(ownerHandle);
  await expect(ownerRows).toHaveCount(2);
  await expect(ownerRows.getByRole("button")).toHaveCount(0);
});

test("a delegated admin is offered the switch, Edit and Delete on a member's schedule and on none of the box owner's", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, member, admin, ownerHandle, memberHandle } = await delegateView(root);
  await owner.workloads.createSchedule({ input: STATS, cadence: "daily" });
  await member.workloads.createSchedule({ input: STATS, cadence: "daily" });
  await routeTrpc(page, serveCorpusProcedures(admin, READS));
  await routeOrbSocket(page);
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-schedules", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const ofMember: ScheduleIdentity = { kind: STATS.kind, cadence: "daily", ownerHandle: memberHandle };
  const ofOwner: ScheduleIdentity = { ...ofMember, ownerHandle };
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(ofMember), exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: scheduleEditName(ofMember), exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: scheduleDeleteName(ofMember), exact: true })).toHaveCount(1);
  await expect(page.getByText(scheduleName(ofOwner), { exact: true })).toHaveCount(1);
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(ofOwner), exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: scheduleEditName(ofOwner), exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: scheduleDeleteName(ofOwner), exact: true })).toHaveCount(0);
});
