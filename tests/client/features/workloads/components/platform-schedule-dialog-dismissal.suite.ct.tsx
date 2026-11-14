import { testId } from "@orb/client/lib";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import {
  SCHEDULE_CADENCE_FIELD_NAME,
  SCHEDULE_CREATE_NAME,
  SCHEDULE_CREATE_TITLE,
  SCHEDULE_EDIT_TITLE,
  SCHEDULE_SAVE_NAME,
} from "#client/features/workloads/lib/workloads-names.ts";
import type { ScheduleIdentity } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import { SCHEDULE_CADENCE_LABELS, scheduleEditName } from "#client/features/workloads/lib/workloads-schedule-model.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { ScheduleDialogDismissalStory } from "./_schedule-dialog-dismissal-stories.tsx";

const CREATED_SCHEDULE = { kind: "reconcile-stats", cadence: "daily", ownerHandle: null, mode: "singular" } as const satisfies ScheduleIdentity;
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
        input: { kind: CREATED_SCHEDULE.kind, params: {} },
        mode: "singular",
        cadence: CREATED_SCHEDULE.cadence,
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
      await expect(createDialog.getByRole("heading", { name: SCHEDULE_CREATE_TITLE, exact: true })).toBeVisible();
      await expectPairedScheduleActions(createDialog, SCHEDULE_CREATE_NAME);
      if (viewport.label === "desktop") {
        await test.step("the geometry assertion rejects misaligned production actions", () => expectMisalignmentRejected(createDialog));
      }
      await expectScheduleActionsAfterScroll(createDialog, SCHEDULE_CREATE_NAME);
      await createDialog.getByRole("combobox", { name: SCHEDULE_CADENCE_FIELD_NAME, exact: true }).click();
      await page.getByRole("option", { name: SCHEDULE_CADENCE_LABELS.weekly, exact: true }).click();
      await dismissScheduleDialog(page, createDialog);
      await expect(createDialog).toHaveCount(0);
      await expect(createTrigger).toBeFocused();
      expect(await caller.workloads.listSchedules({})).toEqual(schedulesBefore);

      await createTrigger.click();
      await expect(createDialog.getByRole("combobox", { name: SCHEDULE_CADENCE_FIELD_NAME, exact: true })).toHaveText(SCHEDULE_CADENCE_LABELS.daily);
      await dismissScheduleDialog(page, createDialog);
      await expect(createDialog).toHaveCount(0);
      await expect(createTrigger).toBeFocused();

      const createdRow = page.locator('[data-slot="list-row-root"]').filter({ hasText: SCHEDULE_CADENCE_LABELS.daily });
      await expect(createdRow).toHaveCount(1);
      const editTrigger = createdRow.getByRole("button", { name: scheduleEditName(CREATED_SCHEDULE), exact: true });
      await editTrigger.click();
      const editDialog = page.getByTestId(testId("editScheduleDialog"));
      // The edit dialog shares the create dialog's body; its title is what says which one is open.
      await expect(editDialog.getByRole("heading", { name: SCHEDULE_EDIT_TITLE, exact: true })).toBeVisible();
      await expectPairedScheduleActions(editDialog, SCHEDULE_SAVE_NAME);
      await expectScheduleActionsAfterScroll(editDialog, SCHEDULE_SAVE_NAME);
      const cadence = editDialog.getByRole("combobox", { name: SCHEDULE_CADENCE_FIELD_NAME, exact: true });
      await expect(cadence).toHaveText(SCHEDULE_CADENCE_LABELS.daily);
      await cadence.click();
      await page.getByRole("option", { name: SCHEDULE_CADENCE_LABELS.weekly, exact: true }).click();
      await dismissScheduleDialog(page, editDialog);
      await expect(editDialog).toHaveCount(0);
      await expect(editTrigger).toBeFocused();
      await expect.poll(async () => (await caller.workloads.listSchedules({})).find((schedule) => schedule.id === created.id)?.cadence).toBe("daily");
      expect(await caller.workloads.listSchedules({})).toEqual(schedulesBefore);

      await editTrigger.click();
      await expect(editDialog.getByRole("combobox", { name: SCHEDULE_CADENCE_FIELD_NAME, exact: true })).toHaveText(SCHEDULE_CADENCE_LABELS.daily);
      await dismissScheduleDialog(page, editDialog);
      await expect(editDialog).toHaveCount(0);
      await expect(editTrigger).toBeFocused();
    });
  });
}

async function expectMisalignmentRejected(dialog: import("@playwright/test").Locator): Promise<void> {
  const cancel = dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
  const transform = await cancel.evaluate((node) => {
    const original = node.style.transform;
    node.style.transform = `translateY(${node.getBoundingClientRect().height}px)`;
    return original;
  });
  try {
    await expect(expectPairedScheduleActions(dialog, SCHEDULE_CREATE_NAME)).rejects.toThrow(/toBeLessThanOrEqual/u);
  } finally {
    await cancel.evaluate((node, original) => {
      node.style.transform = original;
    }, transform);
  }
  await expectPairedScheduleActions(dialog, SCHEDULE_CREATE_NAME);
}

async function expectPairedScheduleActions(dialog: import("@playwright/test").Locator, submitLabel: string): Promise<void> {
  const submit = dialog.getByRole("button", { name: submitLabel, exact: true });
  const cancel = dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
  await expect(submit).toBeVisible();
  await expect(cancel).toBeVisible();
  const [submitBox, cancelBox] = await Promise.all([submit.boundingBox(), cancel.boundingBox()]);
  if (submitBox === null || cancelBox === null) {
    throw new Error("Paired schedule actions must have measurable bounds");
  }
  await test.info().attach("schedule-action-bounds", {
    body: JSON.stringify({ submit: submitBox, cancel: cancelBox }),
    contentType: "application/json",
  });
  expect(Math.abs(submitBox.y - cancelBox.y)).toBeLessThanOrEqual(1);
  await expect(submit).toBeInViewport({ ratio: 1 });
  await expect(cancel).toBeInViewport({ ratio: 1 });
  const footer = dialog.locator('[data-slot="dialog-footer"]').filter({ has: dialog.page().getByRole("button", { name: submitLabel, exact: true }) });
  await expect(footer.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true })).toHaveCount(1);
}

async function expectScheduleActionsAfterScroll(dialog: import("@playwright/test").Locator, submitLabel: string): Promise<void> {
  const scrolls = await dialog.evaluate((node) => {
    const scroller = [node, ...node.querySelectorAll("*")].find(
      (element) => element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === "auto",
    );
    if (scroller === undefined) {
      return false;
    }
    scroller.scrollTop = scroller.scrollHeight;
    return true;
  });
  if (!scrolls) {
    return;
  }
  await expect.poll(() => dialog.evaluate((node) => [node, ...node.querySelectorAll("*")].some((element) => element.scrollTop > 0))).toBe(true);
  await expectPairedScheduleActions(dialog, submitLabel);
}

async function dismissScheduleDialog(page: import("@playwright/test").Page, dialog: import("@playwright/test").Locator): Promise<void> {
  const cancel = dialog.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true });
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
