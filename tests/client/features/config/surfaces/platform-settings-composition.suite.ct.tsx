import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { resolvedLength } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import type { SettingsCompositionStory } from "./_settings-composition-stories.tsx";

const STORY = "tests/client/features/config/surfaces/_settings-composition-stories/SettingsCompositionStory";
const TRACK_CASES = [
  { sectionId: "chat-memory" },
  { sectionId: "world-info-settings" },
  { sectionId: "chat-databank" },
  { sectionId: "workloads-tuning" },
  { sectionId: "admin-media-trust" },
] as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", forcedColors: "none", reducedMotion: "reduce" });
});

// Measure adjacency, not equal control widths: a switch must retain its own touch box beside its label.
async function expectReadingPair(page: Page, field: Locator): Promise<void> {
  await expect(field).toBeVisible();
  const label = field.locator('[data-slot="field-label"]');
  const control = field.locator('[data-slot="field-control-col"]');
  const geometry = await field.evaluate((element) => {
    const labelNode = element.querySelector('[data-slot="field-label"]');
    const controlNode = element.querySelector('[data-slot="field-control-col"]');
    if (labelNode === null || controlNode === null) {
      throw new Error("The production Field must expose its label and control column");
    }
    const range = document.createRange();
    range.selectNodeContents(labelNode);
    const labelBox = range.getBoundingClientRect();
    const visibleControl = controlNode.querySelector('[data-slot="number-field-root"], [role="switch"], [role="combobox"]');
    if (visibleControl === null) {
      throw new Error("The measured row must contain an actual input or switch");
    }
    const controlBox = visibleControl.getBoundingClientRect();
    let container = element.parentElement;
    while (container !== null && getComputedStyle(container).containerType === "normal") {
      container = container.parentElement;
    }
    if (container === null) {
      throw new Error("Settings geometry must run inside the production container context");
    }
    return {
      containerWidth: container.getBoundingClientRect().width,
      label: { left: labelBox.left, right: labelBox.right, bottom: labelBox.bottom },
      control: { left: controlBox.left, top: controlBox.top, width: controlBox.width },
    };
  });
  await expect(label).toBeVisible();
  await expect(control).toBeVisible();
  expect(geometry.control.width).toBeGreaterThan(0);
  const stackStep = await resolvedLength(page, "var(--container-cq-32)", field);
  const column = await resolvedLength(page, "var(--width-control-col)", field);
  const valid =
    geometry.containerWidth < stackStep
      ? geometry.control.top >= geometry.label.bottom
      : geometry.control.left >= geometry.label.left && geometry.control.left - geometry.label.right <= column;
  expect(valid, JSON.stringify({ ...geometry, stackStep, column })).toBe(true);
}

const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false },
  { name: "narrow desktop pane", width: 390, viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false },
  { name: "phone portrait", width: 390, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  { name: "phone short landscape", width: 844, viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
] as const;

for (const { name, width, viewport, hasTouch, isMobile } of REGIMES) {
  test.describe(name, () => {
    test.use({ viewport, hasTouch, isMobile });

    for (const subject of TRACK_CASES) {
      test(`${subject.sectionId} keeps labels and controls in one readable track`, async ({ mount, page }) => {
        await using root = await createCorpusHarness();
        const caller = await root.internalCallerFor(root.ownerId);
        await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
        await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
        await routeTrpc(
          page,
          serveCorpusProcedures(caller, [
            "sessions.me",
            "settings.getUserSettings",
            "settings.getAppSettingsWithOverrides",
            "connection.list",
            "connection.listBindings",
          ]),
        );
        await mount<typeof SettingsCompositionStory>(STORY, { sectionId: subject.sectionId, width });
        const fields = page.locator('[data-slot="field-root"]');
        await expect(fields.first()).toBeVisible();
        expect(await fields.count()).toBeGreaterThan(0);
        for (const field of await fields.all()) {
          await expectReadingPair(page, field);
        }
      });
    }

    test("Frosted glass keeps each independent surface switch beside its label", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]));
      await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "appearance-effects", width });
      const fields = page.locator('[data-setting="frosted-glass"] [data-slot="field-root"]');
      await expect(fields).toHaveCount(4);
      for (const field of await fields.all()) {
        await expectReadingPair(page, field);
      }
      // The surrounding ordinary setting is a positive control for the existing parent tracks.
      await expectReadingPair(page, page.locator('[data-setting="prose-shadow"] [data-slot="field-root"]'));
    });

    test("Backup keeps its download action with the selected export kinds", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings"]));
      await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "backup-export", width });
      const download = page.getByRole("button", { name: "Download my library", exact: true });
      await expect(download).toBeEnabled();
      const selections = page.locator('[data-slot="setting-row-group"]');
      const selectionBox = await selections.boundingBox();
      const buttonBox = await download.boundingBox();
      if (selectionBox === null || buttonBox === null) {
        throw new Error("The export form and its download action must be visible");
      }
      expect(buttonBox.x).toBeGreaterThanOrEqual(selectionBox.x);
      expect(Math.abs(buttonBox.x - selectionBox.x)).toBeLessThanOrEqual(1);
      expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(selectionBox.x + selectionBox.width);
      for (const checkbox of await page.getByRole("checkbox").all()) {
        await checkbox.uncheck();
      }
      await expect(download).toBeDisabled();
    });

    test("Automation keeps the single owner limit bounded without hiding its steppers", async ({ mount, page }) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: DEFAULT_APPEARANCE_SETTINGS });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "automation.getOwnerBudgets"]));
      await mount<typeof SettingsCompositionStory>(STORY, { sectionId: "automation-budget", width });
      const input = page.getByRole("textbox", { name: "Runs per hour", exact: true });
      await expect(input).toBeVisible();
      const field = page.locator('[data-slot="field-root"]').filter({ has: input });
      const control = field.locator('[data-slot="number-field-root"]');
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      if (box === null) {
        throw new Error("The owner limit must have a real control box");
      }
      expect(box.width).toBeLessThanOrEqual(await resolvedLength(page, "var(--width-control-col)", field));
      await expect(control.getByRole("button")).toHaveCount(2);
    });
  });
}
