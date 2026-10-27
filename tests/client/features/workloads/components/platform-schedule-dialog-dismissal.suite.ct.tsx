import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { SCHEDULE_CADENCE_LABELS } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const STORY = "tests/client/features/workloads/components/_schedule-dialog-dismissal-stories/ScheduleDialogDismissalStory";
const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900, hasTouch: false },
  { label: "phone portrait", width: 390, height: 844, hasTouch: true },
  { label: "short landscape", width: 844, height: 390, hasTouch: true },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.label} schedule dialogs`, () => {
    test.use({ isMobile: viewport.hasTouch, viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.hasTouch });

    test("dismisses create and edit without saving, restores focus, and reopens with the seeded cadence", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const created = await caller.workloads.createSchedule({
        input: { kind: "reconcile-stats", params: {} },
        mode: "singular",
        cadence: "daily",
        enabled: false,
      });
      const schedulesBefore = await caller.workloads.listSchedules({});
      await routeTrpc(
        page,
        serveCorpusProcedures(caller, [
          "sessions.me",
          "workloads.listSchedules",
          "admin.listUsers",
          "settings.getUserSettings",
          "connection.listBindings",
          "connection.list",
        ]),
      );
      await mount<typeof ScheduleDialogDismissalStory>(STORY, { width: viewport.width });

      const createTrigger = page.getByTestId(testId("scheduleCreateButton"));
      await createTrigger.click();
      const createDialog = page.getByTestId(testId("createScheduleDialog"));
      await expect(createDialog).toBeVisible();
      await createDialog.getByRole("combobox", { name: "Runs", exact: true }).click();
      await page.getByRole("option", { name: SCHEDULE_CADENCE_LABELS.weekly, exact: true }).click();
      await dismissScheduleDialog(page, createDialog);
      await expect(createDialog).toHaveCount(0);
      await expect(createTrigger).toBeFocused();
      expect(await caller.workloads.listSchedules({})).toEqual(schedulesBefore);

      await createTrigger.click();
      await expect(createDialog.getByRole("combobox", { name: "Runs", exact: true })).toHaveText(SCHEDULE_CADENCE_LABELS.daily);
      await dismissScheduleDialog(page, createDialog);
      await expect(createDialog).toHaveCount(0);
      await expect(createTrigger).toBeFocused();

      const createdRow = page.locator('[data-slot="list-row-root"]').filter({ hasText: SCHEDULE_CADENCE_LABELS.daily });
      await expect(createdRow).toHaveCount(1);
      const editTrigger = createdRow.getByRole("button", { name: /Edit .* schedule/u });
      await editTrigger.click();
      const editDialog = page.getByTestId(testId("editScheduleDialog"));
      const cadence = editDialog.getByRole("combobox", { name: "Runs", exact: true });
      await expect(cadence).toHaveText(SCHEDULE_CADENCE_LABELS.daily);
      await cadence.click();
      await page.getByRole("option", { name: SCHEDULE_CADENCE_LABELS.weekly, exact: true }).click();
      await dismissScheduleDialog(page, editDialog);
      await expect(editDialog).toHaveCount(0);
      await expect(editTrigger).toBeFocused();
      await expect.poll(async () => (await caller.workloads.listSchedules({})).find((schedule) => schedule.id === created.id)?.cadence).toBe("daily");
      expect(await caller.workloads.listSchedules({})).toEqual(schedulesBefore);

      await editTrigger.click();
      await expect(editDialog.getByRole("combobox", { name: "Runs", exact: true })).toHaveText(SCHEDULE_CADENCE_LABELS.daily);
      await dismissScheduleDialog(page, editDialog);
      await expect(editDialog).toHaveCount(0);
      await expect(editTrigger).toBeFocused();
    });
  });
}

async function dismissScheduleDialog(page: import("@playwright/test").Page, dialog: import("@playwright/test").Locator): Promise<void> {
  const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
  await expect(cancel).toBeVisible();
  await expect(cancel).toBeEnabled();
  const bounds = await cancel.boundingBox();
  const viewport = page.viewportSize();
  if (bounds === null || viewport === null) {
    throw new Error("The schedule dismissal action and viewport must have measurable bounds");
  }
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await cancel.click();
}
