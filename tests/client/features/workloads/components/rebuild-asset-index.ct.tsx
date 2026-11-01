import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { ASSET_KIND_ITEMS, WORKLOAD_KIND_LABELS } from "#client/features/workloads/lib/workloads-model.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

// The owner's schedule dialog over the real composed server: the rebuild kind offers its asset-kind control, and
// the schedule it saves carries the chosen kind.
const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const CHOSEN_KIND = "gallery";

test.use({ viewport: { width: 1440, height: 900 } });

test("scheduling the asset index rebuild offers the asset kind and saves the one picked", async ({ mount, page }) => {
  const label = ASSET_KIND_ITEMS.find((item) => "value" in item && item.value === CHOSEN_KIND);
  if (label === undefined || !("label" in label)) {
    throw new Error("the asset kind picker does not list the chosen kind");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "workloads.listSchedules",
      "workloads.createSchedule",
      "workloads.estimateModelCalls",
      "admin.listUsers",
      "settings.getUserSettings",
      "connection.listBindings",
      "connection.list",
    ]),
  );
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 1440 });

  await page.getByTestId(testId("scheduleCreateButton")).click();
  const dialog = page.getByTestId(testId("createScheduleDialog"));
  await dialog.getByRole("combobox", { name: "Job", exact: true }).click();
  await page.getByRole("option", { name: WORKLOAD_KIND_LABELS["assets-rebuild-index"], exact: true }).click();
  await dialog.getByRole("combobox", { name: "What to rebuild", exact: true }).click();
  await page.getByRole("option", { name: label.label, exact: true }).click();
  await page.getByTestId(testId("createScheduleSubmit")).click();

  await expect
    .poll(async () => (await caller.workloads.listSchedules({})).map((schedule) => ({ kind: schedule.kind, params: schedule.params, mode: schedule.mode })))
    .toContainEqual({ kind: "assets-rebuild-index", params: { kind: CHOSEN_KIND }, mode: "bulk" });
});
