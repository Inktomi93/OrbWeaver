import { QUALITY_LEVELS } from "@orb/contracts/preset";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "preset.list",
  "preset.get",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
const REGIMES = [
  {
    name: "wide long identity",
    width: 960,
    viewport: { width: 1280, height: 900 },
    coarse: false,
    appearance: appearanceSettingsSchema.parse({}),
    short: false,
  },
  {
    name: "short coarse landscape",
    width: 844,
    viewport: { width: 844, height: 390 },
    coarse: true,
    appearance: appearanceSettingsSchema.parse({}),
    short: true,
  },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });

    test("the preset band keeps fitting identity, actions and status on one row above its single tab strip", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: null } });
      const preset = await caller.preset.create({
        name: regime.short ? "Landscape authoring" : "Northern campaign generation profile ".repeat(12).trimEnd(),
        kind: "generation",
      });
      await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof PresetActionGroupsStory>(STORY, {
        width: regime.width,
        appearance: regime.appearance,
        subject: "editor",
        presetId: preset.id,
      });
      const editor = page.getByRole("region", { name: "Preset editor", exact: true });
      const title = editor.getByRole("heading", { name: preset.name, exact: true });
      const rename = editor.getByRole("button", { name: "Rename preset", exact: true });
      const activate = editor.getByRole("button", { name: "Activate — use this preset for generation", exact: true });
      const reset = editor.getByRole("button", { name: "Reset to starter arrangement", exact: true });
      const status = editor.locator('[data-slot="autosave-status"]');
      await expect(title).toBeVisible();
      await expect(status).toHaveText("Saved");
      const tabs = editor.getByRole("tablist", { name: "Preset sections", exact: true });
      await expect(tabs).toHaveCount(1);
      const tabBoxes = await tabs.getByRole("tab").evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));
      expect(new Set(tabBoxes).size).toBe(1);
      await rename.focus();
      await page.keyboard.press("Tab");
      await expect(activate).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(reset).toBeFocused();
      const geometry = await actionGroupGeometry(editor, [rename, activate, reset]);
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      const floor = await resolvedLength(page, "var(--size-control-sm)", editor);
      for (const control of geometry.controls) {
        expect(control.height).toBeGreaterThanOrEqual(floor);
      }
      const boxes = await Promise.all([title, rename, activate, status, reset].map((part) => part.boundingBox()));
      if (boxes.some((box) => box === null)) {
        throw new Error("Every identity, action and save-state part must render");
      }
      await info.attach("preset-sticky-fit", { body: JSON.stringify({ boxes, geometry }), contentType: "application/json" });
      const present = boxes.flatMap((box) => (box === null ? [] : [box]));
      expect(Math.max(...present.map((box) => box.y))).toBeLessThan(Math.min(...present.map((box) => box.y + box.height)));
      const strip = tabs.locator("..");
      const column = strip.locator("..");
      const [stripBox, columnBox] = await Promise.all([strip.boundingBox(), column.boundingBox()]);
      if (stripBox === null || columnBox === null) {
        throw new Error("The real tab scroll wrapper and shared header column must render");
      }
      const gap = await resolvedLength(page, "var(--spacing-block)", column);
      expect(columnBox.height).toBeLessThanOrEqual(Math.max(...present.map((box) => box.height)) + gap + stripBox.height + 1);
    });
  });
}

test.describe("coarse narrow save failure", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("the compact preset band retains its real failed save, Retry and reset confirmation without losing the draft", async ({ mount, page }, info) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = ENLARGED_APPEARANCE_SETTINGS;
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const preset = await caller.preset.create({ name: "Failed save authoring", kind: "generation" });
    const firstSave = holdServed();
    let intercepted = false;
    const calls = await routeTrpc(page, {
      ...serveCorpusProcedures(caller, READS),
      ...serveCorpusProcedures(caller, ["preset.update"], (input) => {
        if (input.id !== preset.id || input.config === undefined || intercepted) {
          return;
        }
        intercepted = true;
        return firstSave;
      }),
    });
    await mount<typeof PresetActionGroupsStory>(STORY, { width: 390, appearance, subject: "editor", presetId: preset.id });
    const editor = page.getByRole("region", { name: "Preset editor", exact: true });
    const quality = editor.getByRole("combobox", { name: "Quality", exact: true });
    await quality.focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await firstSave.requested;
    const status = editor.locator('[data-slot="autosave-status"]');
    try {
      await expect(status).toHaveText("Saving…");
    } finally {
      firstSave.fail();
    }
    await expect(status).toHaveAttribute("role", "alert");
    await expect(status).toContainText("Save failed");
    const retry = status.getByRole("button", { name: "Retry", exact: true });
    const reset = editor.getByRole("button", { name: "Reset to starter arrangement", exact: true });
    const geometry = await actionGroupGeometry(editor, [retry, reset]);
    await info.attach("preset-failed-save-fit", { body: JSON.stringify(geometry), contentType: "application/json" });
    expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
    await reset.focus();
    await page.keyboard.press("Enter");
    const confirm = page.getByRole("alertdialog", { name: "Reset to the starter arrangement?", exact: true });
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "Cancel", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(confirm).toBeHidden();
    await expect(reset).toBeFocused();
    expect((await caller.preset.get({ id: preset.id })).config).toEqual(preset.config);
    await retry.focus();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText("Saved");
    await expect.poll(async () => (await caller.preset.get({ id: preset.id })).config.params.quality).toBe(QUALITY_LEVELS[0]);
    expect(calls.count("preset.update")).toBe(2);
  });
});
