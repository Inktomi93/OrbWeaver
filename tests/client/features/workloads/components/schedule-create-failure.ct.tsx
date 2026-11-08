// A refused schedule create is said once, in the dialog that stays open.
import { testId } from "@orb/client/lib";
import { ALERTS_REGION_NAME, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { WORKLOAD_KIND_LABELS } from "#client/features/workloads/lib/workloads-model.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";

test("a refused schedule create is said in the open dialog, and the submit adds no second message", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "workloads.listSchedules",
      "workloads.estimateModelCalls",
      "admin.listUsers",
      "settings.getUserSettings",
      "connection.listBindings",
      "connection.list",
    ]),
    ...serveCorpusProcedures(caller, ["workloads.createSchedule"], (input) => (input.input.kind.length > 0 ? trpcError() : undefined)),
  });
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 1200 });

  await page.getByTestId(testId("scheduleCreateButton")).click();
  const dialog = page.getByTestId(testId("createScheduleDialog"));
  await dialog.getByRole("button", { name: "Create schedule", exact: true }).click();
  await expect(dialog.getByText("Couldn't create the schedule. Try again.", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Create schedule", exact: true })).toBeEnabled();
  // The mutation's toast is the only other message: the submit's rethrow adds none.
  await expect(page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByRole("alert")).toHaveCount(1);
});

test("a refused schedule create behind the paid-run confirm is said by the confirm, with the toast beside it and no form line under it", async ({
  mount,
  page,
}) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [
      "sessions.me",
      "workloads.listSchedules",
      "workloads.estimateModelCalls",
      "admin.listUsers",
      "settings.getUserSettings",
      "connection.listBindings",
      "connection.list",
    ]),
    ...serveCorpusProcedures(caller, ["workloads.createSchedule"], () => trpcError()),
  });
  await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: 1200 });

  await page.getByTestId(testId("scheduleCreateButton")).click();
  const dialog = page.getByTestId(testId("createScheduleDialog"));
  await dialog.getByRole("combobox", { name: "Job", exact: true }).click();
  await page.getByRole("option", { name: WORKLOAD_KIND_LABELS["distill-characters"], exact: true }).click();
  await dialog.getByRole("button", { name: "Create schedule", exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  await confirm.getByRole("button", { name: "Create schedule", exact: true }).click();
  await expect(confirm.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("region", { name: ALERTS_REGION_NAME, exact: true }).getByRole("alert")).toHaveCount(1);
  await expect(dialog.getByText("Couldn't create the schedule. Try again.", { exact: true })).toHaveCount(0);

  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(dialog.getByText("Couldn't create the schedule. Try again.", { exact: true })).toBeVisible();
});
