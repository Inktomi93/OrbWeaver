// @subject packages/client/src/features/workloads/components/schedules-section.tsx
// Each schedule row's title, enable switch, Edit and Delete share one name built from its kind, cadence and, on another
// user's row, its owner; `aria-checked` alone carries the state.
import { testId } from "@orb/client/lib";
import { routeTrpc, serveCorpusProcedures, trpcHold } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { UNRESOLVED_OWNER_HANDLE } from "#client/features/workloads/lib/workloads-model.ts";
import { SCHEDULE_CADENCE_FIELD_NAME } from "#client/features/workloads/lib/workloads-names.ts";
import type { ScheduleIdentity } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import {
  SCHEDULE_CADENCE_LABELS,
  scheduleDeleteName,
  scheduleEditName,
  scheduleEnabledSwitchName,
  scheduleName,
} from "#client/features/workloads/lib/workloads-schedule-model.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
/** A kind the corpus holds no schedule of, so each switch name belongs to the rows this case adds. */
const ADDED_KIND = "import-token-usage-backfill";
const READS = [
  "sessions.me",
  "workloads.listSchedules",
  "workloads.setScheduleEnabled",
  "admin.listUsers",
  "settings.getUserSettings",
  "connection.listBindings",
  "connection.list",
] as const;

test("two schedules in opposite states are found by their stable names, and a flip moves only aria-checked", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const [corpusSchedule] = await caller.workloads.listSchedules({});
  if (corpusSchedule === undefined) {
    throw new Error("The corpus must contain a schedule");
  }
  await caller.workloads.createSchedule({
    input: { kind: ADDED_KIND, params: {} },
    mode: "singular",
    cadence: "daily",
    enabled: false,
  });
  await caller.workloads.setScheduleEnabled({ id: corpusSchedule.id, enabled: true });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 900 });

  const onSwitch = page.getByRole("switch", { name: scheduleEnabledSwitchName({ ...corpusSchedule, ownerHandle: null }), exact: true });
  const offSwitch = page.getByRole("switch", { name: scheduleEnabledSwitchName({ kind: ADDED_KIND, cadence: "daily", ownerHandle: null }), exact: true });
  await expect(onSwitch).toHaveAttribute("aria-checked", "true");
  await expect(offSwitch).toHaveAttribute("aria-checked", "false");
  await offSwitch.click();
  await expect(offSwitch).toHaveAttribute("aria-checked", "true");
  await expect(onSwitch).toHaveAttribute("aria-checked", "true");
});

test("a daily and a weekly schedule of one kind each have their own title, switch, Edit and Delete", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.workloads.createSchedule({ input: { kind: ADDED_KIND, params: {} }, mode: "singular", cadence: "daily", enabled: false });
  await caller.workloads.createSchedule({ input: { kind: ADDED_KIND, params: {} }, mode: "singular", cadence: "weekly", enabled: true });
  await routeTrpc(page, serveCorpusProcedures(caller, READS));
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 900 });

  const daily: ScheduleIdentity = { kind: ADDED_KIND, cadence: "daily", ownerHandle: null };
  const weekly: ScheduleIdentity = { kind: ADDED_KIND, cadence: "weekly", ownerHandle: null };
  const dailySwitch = page.getByRole("switch", { name: scheduleEnabledSwitchName(daily), exact: true });
  const weeklySwitch = page.getByRole("switch", { name: scheduleEnabledSwitchName(weekly), exact: true });
  await expect(dailySwitch).toHaveAttribute("aria-checked", "false");
  await expect(weeklySwitch).toHaveAttribute("aria-checked", "true");
  for (const schedule of [daily, weekly]) {
    await expect(page.getByText(scheduleName(schedule), { exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: scheduleEditName(schedule), exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: scheduleDeleteName(schedule), exact: true })).toHaveCount(1);
  }

  await dailySwitch.click();
  await expect(dailySwitch).toHaveAttribute("aria-checked", "true");
  await expect(weeklySwitch).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: scheduleEditName(weekly), exact: true }).click();
  const editDialog = page.getByTestId(testId("editScheduleDialog"));
  await expect(editDialog.getByRole("combobox", { name: SCHEDULE_CADENCE_FIELD_NAME, exact: true })).toHaveText(SCHEDULE_CADENCE_LABELS.weekly);
});

test("another user's schedule of the same kind and cadence is told apart by its owner's handle", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const member = await root.actor();
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const memberCaller = await root.internalCallerFor(member.id);
  await ownerCaller.workloads.createSchedule({ input: { kind: ADDED_KIND, params: {} }, mode: "singular", cadence: "daily", enabled: true });
  await memberCaller.workloads.createSchedule({ input: { kind: ADDED_KIND, params: {} }, mode: "singular", cadence: "daily", enabled: false });
  await routeTrpc(page, serveCorpusProcedures(ownerCaller, READS));
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 900 });

  const own: ScheduleIdentity = { kind: ADDED_KIND, cadence: "daily", ownerHandle: null };
  const foreign: ScheduleIdentity = { ...own, ownerHandle: member.handle };
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(own), exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(foreign), exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: scheduleEditName(foreign), exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: scheduleDeleteName(foreign), exact: true })).toHaveCount(1);
});

test("another user's schedule is never named as the viewer's own while the owner's handle is still loading", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const member = await root.actor();
  const ownerCaller = await root.internalCallerFor(root.ownerId);
  const memberCaller = await root.internalCallerFor(member.id);
  await ownerCaller.workloads.createSchedule({ input: { kind: ADDED_KIND, params: {} }, mode: "singular", cadence: "daily", enabled: true });
  await memberCaller.workloads.createSchedule({ input: { kind: ADDED_KIND, params: {} }, mode: "singular", cadence: "daily", enabled: false });
  const users = trpcHold<"admin.listUsers">();
  await routeTrpc(page, {
    ...serveCorpusProcedures(
      ownerCaller,
      READS.filter((read) => read !== "admin.listUsers"),
    ),
    "admin.listUsers": users,
  });
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 900 });
  await users.requested;

  const own: ScheduleIdentity = { kind: ADDED_KIND, cadence: "daily", ownerHandle: null };
  const pending: ScheduleIdentity = { ...own, ownerHandle: UNRESOLVED_OWNER_HANDLE };
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(own), exact: true })).toHaveCount(1);
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(own), exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(pending), exact: true })).toHaveAttribute("aria-checked", "false");
  for (const name of [scheduleEditName, scheduleDeleteName]) {
    await expect(page.getByRole("button", { name: name(own), exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: name(pending), exact: true })).toHaveCount(1);
  }

  users.release(await ownerCaller.admin.listUsers());
  const foreign: ScheduleIdentity = { ...own, ownerHandle: member.handle };
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(foreign), exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("switch", { name: scheduleEnabledSwitchName(pending), exact: true })).toHaveCount(0);
});
