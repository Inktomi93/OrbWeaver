import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SCHEDULE_DELETE_CONFIRM_NAME } from "#client/features/workloads/lib/workloads-names.ts";
import type { ScheduleIdentity } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import { scheduleDeleteName } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

/** The schedule this case adds; the corpus may hold another of its kind, so the first match is the one asked about. */
const ADDED = { kind: "reconcile-stats", cadence: "daily", ownerHandle: null, mode: "singular" } as const satisfies ScheduleIdentity;

const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const READS = ["sessions.me", "workloads.listSchedules", "admin.listUsers", "settings.getUserSettings", "connection.listBindings", "connection.list"] as const;

test("Delete schedule asks first: Cancel keeps the schedule, Delete removes it once", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await caller.workloads.createSchedule({ input: { kind: ADDED.kind, params: {} }, mode: "singular", cadence: ADDED.cadence, enabled: false });
  await routeTrpc(page, serveCorpusProcedures(caller, [...READS, "workloads.deleteSchedule"]));
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 900 });

  const before = (await caller.workloads.listSchedules({})).length;
  const remove = page.getByRole("button", { name: scheduleDeleteName(ADDED), exact: true }).first();
  await remove.click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  expect(await caller.workloads.listSchedules({})).toHaveLength(before);

  await remove.click();
  await confirm.getByRole("button", { name: SCHEDULE_DELETE_CONFIRM_NAME, exact: true }).click();
  await expect.poll(async () => (await caller.workloads.listSchedules({})).length).toBe(before - 1);
});
