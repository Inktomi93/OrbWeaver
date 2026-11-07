import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { OPERATOR_TREE_WORKLOAD_KIND } from "@orb/contracts/workloads";
import type { UserId } from "@orb/kit/ids";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { WORKLOAD_KIND_LABELS } from "#client/features/workloads/lib/workloads-model.ts";
import type { RunDependencyStory } from "./_run-dependency-stories.tsx";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

// The server refuses a member the operator's tree, so neither job dialog offers it to one; the box owner keeps it.
const RUN_STORY = "tests/client/features/workloads/components/_run-dependency-stories/RunDependencyStory";
const SCHEDULE_STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const OPERATOR_IMPORT = WORKLOAD_KIND_LABELS[OPERATOR_TREE_WORKLOAD_KIND];
const ANY_MEMBER_JOB = WORKLOAD_KIND_LABELS["reconcile-stats"];
const RELOAD_READS_NAME = "Reload reads";

test.use({ viewport: { width: 1440, height: 900 } });

async function serve(root: ServerTestHarness, page: Page, viewer: UserId): Promise<void> {
  const caller = await root.internalCallerFor(viewer);
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "workloads.list",
      "workloads.listSchedules",
      "admin.listUsers",
      "settings.getUserSettings",
      "connection.listBindings",
      "connection.list",
      "stream.attach",
      "stream.detach",
    ]),
  );
  await routeOrbSocket(page, { awaitAttaches: 0 });
}

async function openRunPicker(page: Page): Promise<void> {
  await page.getByTestId(testId("workloadsRunButton")).click();
  await page.getByTestId(testId("runWorkloadDialog")).getByRole("combobox", { name: "Job", exact: true }).click();
}

test("a member's run picker leaves out the operator import", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await serve(root, page, (await root.actor()).id);
  await mount<typeof RunDependencyStory>(RUN_STORY, { reloadName: RELOAD_READS_NAME });
  await openRunPicker(page);

  await expect(page.getByRole("option", { name: ANY_MEMBER_JOB, exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: OPERATOR_IMPORT, exact: true })).toBeHidden();
});

test("the owner's run picker lists the operator import", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await serve(root, page, root.ownerId);
  await mount<typeof RunDependencyStory>(RUN_STORY, { reloadName: RELOAD_READS_NAME });
  await openRunPicker(page);

  await expect(page.getByRole("option", { name: OPERATOR_IMPORT, exact: true })).toBeVisible();
});

test("a member's schedule picker leaves out the operator import", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await serve(root, page, (await root.actor()).id);
  await mount<typeof ScheduleDialogDismissalStory>(SCHEDULE_STORY, { width: 1440 });

  await page.getByTestId(testId("scheduleCreateButton")).click();
  await page.getByTestId(testId("createScheduleDialog")).getByRole("combobox", { name: "Job", exact: true }).click();

  await expect(page.getByRole("option", { name: ANY_MEMBER_JOB, exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: OPERATOR_IMPORT, exact: true })).toBeHidden();
});
