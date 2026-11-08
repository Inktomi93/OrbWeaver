import { DIALOG_VERBS, testId } from "@orb/client/lib";
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

// The server refuses a member the operator's tree, so neither job dialog offers it to one and no Retry reaches it; the
// box owner keeps both.
const RUN_STORY = "tests/client/features/workloads/components/_run-dependency-stories/RunDependencyStory";
const SCHEDULE_STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const OPERATOR_IMPORT = WORKLOAD_KIND_LABELS[OPERATOR_TREE_WORKLOAD_KIND];
const ANY_MEMBER_JOB = WORKLOAD_KIND_LABELS["reconcile-stats"];
const RELOAD_READS_NAME = "Reload reads";
const RETRY_OPERATOR_IMPORT = `${DIALOG_VERBS.retry}: ${OPERATOR_IMPORT}`;
const STAGED_UPLOAD = { stagedDir: "tree-upload", stagedDigest: "0".repeat(64) };
const LATER_MS = 3_600_000;

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

/** Two ended import rows the admin can see: the owner's run of the operator's tree, and the admin's own upload. A later
 *  start keeps the job worker off each row until its cancel lands. */
async function seedEndedImports(root: ServerTestHarness, admin: UserId): Promise<void> {
  const scheduledAt = root.clock.now() + LATER_MS;
  const owner = await root.principalFor(root.ownerId);
  const bare = await root.services.workloads.start({
    input: { kind: OPERATOR_TREE_WORKLOAD_KIND, params: {} },
    caller: owner,
    mode: "singular",
    ownerId: root.ownerId,
    scheduledAt,
  });
  await root.services.workloads.cancel({ caller: owner, id: bare.id });
  const principal = await root.principalFor(admin);
  const upload = await root.services.workloads.start({
    input: { kind: OPERATOR_TREE_WORKLOAD_KIND, params: STAGED_UPLOAD },
    caller: principal,
    mode: "singular",
    ownerId: admin,
    scheduledAt,
  });
  await root.services.workloads.cancel({ caller: principal, id: upload.id });
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

test("an admin sees no Retry on the owner's run of the operator's tree, and keeps it on their own upload", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const admin = (await root.actor({ role: "admin" })).id;
  await seedEndedImports(root, admin);
  await serve(root, page, admin);
  await mount<typeof RunDependencyStory>(RUN_STORY, { reloadName: RELOAD_READS_NAME });

  const rows = page.locator('[data-slot="workload-row"]').filter({ hasText: OPERATOR_IMPORT });
  await expect(rows).toHaveCount(2);
  await expect(rows.getByRole("button", { name: RETRY_OPERATOR_IMPORT, exact: true })).toHaveCount(1);
  await expect(rows.filter({ hasNotText: "for " }).getByRole("button", { name: RETRY_OPERATOR_IMPORT, exact: true })).toBeVisible();
});

test("the owner keeps Retry on the operator's tree", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  await seedEndedImports(root, (await root.actor({ role: "admin" })).id);
  await serve(root, page, root.ownerId);
  await mount<typeof RunDependencyStory>(RUN_STORY, { reloadName: RELOAD_READS_NAME });

  const rows = page.locator('[data-slot="workload-row"]').filter({ hasText: OPERATOR_IMPORT });
  await expect(rows.getByRole("button", { name: RETRY_OPERATOR_IMPORT, exact: true })).toHaveCount(2);
});
