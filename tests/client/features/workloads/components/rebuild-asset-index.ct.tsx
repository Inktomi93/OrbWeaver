import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { ASSET_KIND_ITEMS, WORKLOAD_KIND_LABELS } from "#client/features/workloads/lib/workloads-model.ts";
import type { WorkloadActionGroupsStory } from "./_action-groups-stories.tsx";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

// The owner's schedule dialog over the real composed server: the rebuild kind offers its asset-kind control, and
// the schedule it saves carries the chosen kind.
const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const CHOSEN_KIND = "gallery";

const ACTIONS_STORY = "tests/client/features/workloads/components/_action-groups-stories/WorkloadActionGroupsStory";

test.use({ viewport: { width: 1440, height: 900 } });

/** The estimate, create and start requests the page sends; a refused form sends none. */
function recordWorkloadRequests(page: Page): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (/workloads\.(estimateModelCalls|createSchedule|start)/.test(request.url())) {
      sent.push(request.url());
    }
  });
  return sent;
}

test("scheduling the asset index rebuild without choosing a kind saves nothing", async ({ mount, page }) => {
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
  const sent = recordWorkloadRequests(page);
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 1440 });

  await page.getByTestId(testId("scheduleCreateButton")).click();
  const dialog = page.getByTestId(testId("createScheduleDialog"));
  await dialog.getByRole("combobox", { name: "Job", exact: true }).click();
  await page.getByRole("option", { name: WORKLOAD_KIND_LABELS["assets-rebuild-index"], exact: true }).click();
  await page.getByTestId(testId("createScheduleSubmit")).click();

  // The form refuses on the picker itself: the dialog stays up, no estimate or create request leaves the page,
  // and nothing was created.
  await expect(dialog.getByRole("combobox", { name: "What to rebuild", exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(sent).toEqual([]);
  expect((await caller.workloads.listSchedules({})).filter((schedule) => schedule.kind === "assets-rebuild-index")).toEqual([]);
});

test("running the asset index rebuild without choosing a kind sends nothing", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "workloads.list",
      "workloads.start",
      "workloads.estimateModelCalls",
      "admin.listUsers",
      "settings.getUserSettings",
      "connection.listBindings",
      "connection.list",
      "stream.attach",
      "stream.detach",
    ]),
  );
  await routeOrbSocket(page, { awaitAttaches: 0 });
  const sent = recordWorkloadRequests(page);
  await mount<typeof WorkloadActionGroupsStory>(ACTIONS_STORY, {
    sectionId: "workloads-jobs",
    width: 960,
    appearance: appearanceSettingsSchema.parse({}),
  });

  await page.getByTestId(testId("workloadsRunButton")).click();
  const dialog = page.getByTestId(testId("runWorkloadDialog"));
  await dialog.getByRole("combobox", { name: "Job", exact: true }).click();
  await page.getByRole("option", { name: WORKLOAD_KIND_LABELS["assets-rebuild-index"], exact: true }).click();
  await page.getByTestId(testId("runWorkloadSubmit")).click();

  await expect(dialog.getByRole("combobox", { name: "What to rebuild", exact: true })).toHaveAttribute("aria-invalid", "true");
  expect(sent).toEqual([]);
  expect(await caller.workloads.list({ kind: "assets-rebuild-index" })).toHaveLength(0);
});

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
