// @subject packages/client/src/features/workloads/components/workloads-jobs-section.tsx
// @subject packages/client/src/features/workloads/components/schedules-section.tsx
// @subject packages/client/src/features/workloads/lib/workloads-model.ts
// A delegated admin sees the box owner's runs and schedules but is offered none of their controls (D17): no Cancel or
// Retry on a run, no switch, Edit or Delete on a schedule. The same viewer keeps every control on a member's rows. When the
// account list fails, no row can be told from the box owner's, so the viewer reads why every other row's controls are
// hidden, and a Retry that reaches the list brings the member's controls back.

import { DIALOG_VERBS } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { StartWorkloadInput } from "@orb/contracts/workloads";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { OTHERS_CONTROLS_HIDDEN_TEXT } from "#client/features/workloads/lib/workloads-failure-copy.ts";
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

/** The delegate's reads with the account list failing until `recover`; every answer still comes from the server. */
function failingAccountList(admin: Caller): { readonly routes: ReturnType<typeof serveCorpusProcedures>; readonly recover: () => void } {
  let failing = true;
  const others = READS.filter((path) => path !== "admin.listUsers");
  return {
    // BAD_REQUEST, which the query client does not retry, so the failed state lands at once.
    routes: {
      ...serveCorpusProcedures(admin, others),
      ...serveCorpusProcedures(admin, ["admin.listUsers"], () => (failing ? trpcError({ code: "BAD_REQUEST" }) : undefined)),
    },
    recover: (): void => {
      failing = false;
    },
  };
}

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
  await expect(memberRows.getByRole("button", { name: /^Cancel: /u })).toHaveCount(1);
  await expect(memberRows.getByRole("button", { name: /^Retry: /u })).toHaveCount(1);
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

test("with the account list failing a delegated admin reads why no run offers controls, and Retry restores the member's", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, member, admin, ownerHandle, memberHandle } = await delegateView(root);
  for (const caller of [owner, member]) {
    await caller.workloads.start({ input: STATS });
  }
  const served = failingAccountList(admin);
  await routeTrpc(page, served.routes);
  await routeOrbSocket(page, { awaitAttaches: 2 });
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-jobs", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const rows = page.locator('[data-slot="workload-row"]');
  await expect(page.getByText(OTHERS_CONTROLS_HIDDEN_TEXT, { exact: true })).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(rows.getByRole("button", { name: /^Cancel: /u })).toHaveCount(0);

  served.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(rows.filter({ hasText: memberHandle }).getByRole("button", { name: /^Cancel: /u })).toHaveCount(1);
  await expect(rows.filter({ hasText: ownerHandle }).getByRole("button")).toHaveCount(0);
  await expect(page.getByText(OTHERS_CONTROLS_HIDDEN_TEXT, { exact: true })).toHaveCount(0);
});

test("with the account list failing a delegated admin reads why no schedule offers controls, and Retry restores the member's", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner, member, admin, ownerHandle, memberHandle } = await delegateView(root);
  await owner.workloads.createSchedule({ input: STATS, cadence: "daily" });
  await member.workloads.createSchedule({ input: STATS, cadence: "daily" });
  const served = failingAccountList(admin);
  await routeTrpc(page, served.routes);
  await routeOrbSocket(page);
  await mount<typeof WorkloadActionGroupsStory>(STORY, { sectionId: "workloads-schedules", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  await expect(page.getByText(OTHERS_CONTROLS_HIDDEN_TEXT, { exact: true })).toBeVisible();
  await expect(page.getByRole("switch")).toHaveCount(0);

  served.recover();
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  const ofMember: ScheduleIdentity = { kind: STATS.kind, cadence: "daily", ownerHandle: memberHandle };
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(ofMember), exact: true })).toHaveCount(1);
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName({ ...ofMember, ownerHandle }), exact: true })).toHaveCount(0);
  await expect(page.getByText(OTHERS_CONTROLS_HIDDEN_TEXT, { exact: true })).toHaveCount(0);
});
