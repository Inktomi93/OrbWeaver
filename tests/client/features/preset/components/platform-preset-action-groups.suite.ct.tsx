import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
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
  "settings.updateUserSettingsSection",
  "preset.create",
] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, hasTouch: regime.coarse, isMobile: regime.coarse });

    test("the preset header keeps identity and independent Rename, Activate and Reset actions", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: null } });
      const preset = await caller.preset.create({ name: "Northern campaign generation profile ".repeat(12).trimEnd(), kind: "generation" });
      const name = preset.name;
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      const props = { width: regime.width, appearance: regime.appearance, subject: "editor" as const, presetId: preset.id };
      const mounted = await mount<typeof PresetActionGroupsStory>(STORY, props);
      const rename = page.getByRole("button", { name: "Rename preset", exact: true });
      const activate = page.getByRole("button", { name: "Activate — use this preset for generation", exact: true });
      const reset = page.getByRole("button", { name: "Reset to starter arrangement", exact: true });
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      await rename.focus();
      await page.keyboard.press("Tab");
      await expect(activate).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(reset).toBeFocused();
      const geometry = await actionGroupGeometry(page.getByRole("group", { name: "Preset action host", exact: true }), [rename, activate, reset]);
      await info.attach("preset-header-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await rename.focus();
      await page.keyboard.press("Enter");
      const renameDialog = page.getByRole("dialog", { name: "Rename preset", exact: true });
      await expect(renameDialog.getByRole("textbox", { name: "Preset name", exact: true })).toHaveValue(name);
      await expect(renameDialog.getByRole("textbox", { name: "Preset name", exact: true })).toBeFocused();
      await renameDialog.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(renameDialog).toBeHidden();
      await expect(rename).toBeFocused();
      await reset.focus();
      await page.keyboard.press("Enter");
      const confirm = page.getByRole("alertdialog", { name: "Reset to the starter arrangement?", exact: true });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Cancel", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(confirm).toBeHidden();
      await expect(reset).toBeFocused();
      expect(await caller.preset.get({ id: preset.id })).toEqual(preset);
      await activate.focus();
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await caller.settings.getUserSettings()).config.seeds.defaultPresetId).toBe(preset.id);
      expect(calls.count("settings.updateUserSettingsSection")).toBe(1);
      // This isolated body has no app-root user bus; a fresh production mount reads the persisted active arm.
      await mounted.unmount();
      await mount<typeof PresetActionGroupsStory>(STORY, props);
      await expect(page.getByText("Active", { exact: true })).toBeVisible();
      await expect(activate).toHaveCount(0);
      await expect(rename).toBeVisible();
      await expect(reset).toBeVisible();
    });

    test("the empty-search recovery retains Clear search and New preset as distinct working actions", async ({ mount, page }, info) => {
      await using root = await createCorpusHarness();
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
      const before = await caller.preset.list();
      expect(before.length).toBeGreaterThan(0);
      const calls = await routeTrpc(page, serveCorpusProcedures(caller, READS));
      await mount<typeof PresetActionGroupsStory>(STORY, { width: regime.width, appearance: regime.appearance, subject: "list" });
      const search = page.getByRole("textbox", { name: "Search presets", exact: true });
      await search.fill("No matching layout qualification preset");
      const clear = page.getByRole("button", { name: "Clear search", exact: true });
      const create = page.getByRole("button", { name: "New preset", exact: true });
      await clear.focus();
      await page.keyboard.press("Tab");
      await expect(create).toBeFocused();
      const geometry = await actionGroupGeometry(page.getByRole("group", { name: "Preset action host", exact: true }), [clear, create]);
      await info.attach("preset-recovery-geometry", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await clear.focus();
      await page.keyboard.press("Enter");
      await expect(search).toHaveValue("");
      await expect(page.getByRole("radiogroup", { name: "Active preset for generation", exact: true })).toBeVisible();
      expect(calls.count("preset.create")).toBe(0);
      expect(await caller.preset.list()).toEqual(before);
      await search.fill("No matching layout qualification preset");
      await create.focus();
      await page.keyboard.press("Enter");
      await expect.poll(async () => (await caller.preset.list()).length).toBe(before.length + 1);
      expect(calls.lastInput("preset.create")).toEqual({ name: "New preset", kind: "generation" });
    });
  });
}
