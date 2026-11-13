// A stored operator-tree run whose account is not the box owner says why it cannot run: on the holder's schedule row,
// and in the toast the box owner reads when Retry on a member's row is refused. A member's own save of such a schedule
// is refused as owner-only, and the toast says so before any write.
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { WORKLOAD_OWNER_ONLY_REFUSAL, WORKLOAD_RUN_ACCOUNT_REFUSAL } from "@orb/contracts/workloads";
import { noticeToast, routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, plantMemberOperatorRun, plantMemberOperatorSchedule } from "@orb/testkit/node/composed";
import { MODEL_RUN_ESTIMATE_FAILED } from "#client/components/model-run-confirm-copy.ts";
import { SCHEDULE_PAUSED_LABEL, scheduleEditName } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const SCHEDULES_STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const JOBS_STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";
const SCHEDULE_READS = [
  "sessions.me",
  "workloads.listSchedules",
  "admin.listUsers",
  "settings.getUserSettings",
  "connection.listBindings",
  "connection.list",
] as const;
const JOBS_READS = [
  "settings.getUserSettings",
  "sessions.me",
  "workloads.list",
  "workloads.get",
  "workloads.estimateRetryModelCalls",
  "workloads.retry",
  "admin.listUsers",
  "connection.listBindings",
  "connection.list",
  "stream.attach",
  "stream.detach",
] as const;

test("a member's stored operator-tree schedule names the refusal on its row", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const member = await root.actor();
  await plantMemberOperatorSchedule(root, { boxOwnerId: root.ownerId, memberId: member.id });
  const caller = await root.internalCallerFor(member.id);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await routeTrpc(page, serveCorpusProcedures(caller, SCHEDULE_READS));
  await mount<typeof ScheduleDialogDismissalStory>(SCHEDULES_STORY, { width: 900 });

  const [schedule, ...others] = await caller.workloads.listSchedules({});
  if (schedule === undefined) {
    throw new Error("The member must hold the planted schedule");
  }
  expect(others).toEqual([]);
  await expect(page.getByRole("button", { name: scheduleEditName({ ...schedule, ownerHandle: null }), exact: true })).toHaveCount(1);
  await expect(page.getByText(WORKLOAD_RUN_ACCOUNT_REFUSAL, { exact: false })).toBeVisible();
  // The planted schedule is paused as well as refused, and the one row says both.
  expect(schedule.enabled).toBe(false);
  await expect(page.getByText(SCHEDULE_PAUSED_LABEL, { exact: false })).toBeVisible();
});

test("the box owner's save on a member's operator-tree schedule toasts the refusal it meets", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const member = await root.actor();
  const planted = await plantMemberOperatorSchedule(root, { boxOwnerId: root.ownerId, memberId: member.id });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, [...SCHEDULE_READS, "workloads.estimateModelCalls", "workloads.updateSchedule"]));
  await mount<typeof ScheduleDialogDismissalStory>(SCHEDULES_STORY, { width: 900 });

  const schedule = (await caller.workloads.listSchedules({})).find((row) => row.id === planted);
  if (schedule === undefined) {
    throw new Error("The box owner must see the member's planted schedule");
  }
  await page.getByRole("button", { name: scheduleEditName({ ...schedule, ownerHandle: member.handle }), exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Save/u }).click();
  await expect(noticeToast(page, { title: WORKLOAD_RUN_ACCOUNT_REFUSAL })).toBeVisible();
});

test("a member's save of their own stored operator-tree schedule toasts the owner-only refusal and writes nothing", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const member = await root.actor();
  const planted = await plantMemberOperatorSchedule(root, { boxOwnerId: root.ownerId, memberId: member.id });
  const caller = await root.internalCallerFor(member.id);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  // The save counts the run before it writes, and the count judges the same authority `updateSchedule` does, so this refusal
  // is the one a member's retune meets. `updateSchedule` is served so a write that slipped past it would land and show.
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, [...SCHEDULE_READS, "workloads.estimateModelCalls", "workloads.updateSchedule"]));
  await mount<typeof ScheduleDialogDismissalStory>(SCHEDULES_STORY, { width: 900 });

  const schedule = (await caller.workloads.listSchedules({})).find((row) => row.id === planted);
  if (schedule === undefined) {
    throw new Error("The member must hold the planted schedule");
  }
  await page.getByRole("button", { name: scheduleEditName({ ...schedule, ownerHandle: null }), exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Save/u }).click();
  await expect(noticeToast(page, { title: MODEL_RUN_ESTIMATE_FAILED, description: WORKLOAD_OWNER_ONLY_REFUSAL })).toBeVisible();
  expect(calls.count("workloads.updateSchedule")).toBe(0);
});

test("the box owner's Retry on a member's operator-tree run toasts the refusal it meets", async ({ mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  const member = await root.actor();
  await plantMemberOperatorRun(root, { boxOwnerId: root.ownerId, memberId: member.id });
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, serveCorpusProcedures(caller, JOBS_READS));
  await routeOrbSocket(page, { awaitAttaches: 0 });
  await mount<typeof WorkloadActionGroupsStory>(JOBS_STORY, { sectionId: "workloads-jobs", width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const row = page.locator('[data-slot="workload-row"]').filter({ hasText: member.handle });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: /^Retry/u }).click();
  await expect(noticeToast(page, { title: WORKLOAD_RUN_ACCOUNT_REFUSAL })).toBeVisible();
});
