// The preset editor's tab strip on a phone: when the reveal scrolls the selected tab in, the start edge says tabs lie past it.
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_BUILT_IN_SUBTITLE, PRESET_EDITOR_NAME, PRESET_SECTIONS_NAME } from "#client/features/preset/lib/preset-names.ts";
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
  "regex.listForPreset",
  "regex.listScripts",
  "settings.updateUserSettingsSection",
] as const;

test.describe("wide desktop", () => {
  test.use({ viewport: { width: 1280, height: 900 }, hasTouch: false, isMobile: false });

  test("the built-in row's lock does not move its name off the x every other row's name starts at", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    await caller.preset.create({ name: "Aligned witness", kind: "generation" });
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof PresetActionGroupsStory>(STORY, { width: 960, appearance, subject: "list" });
    // The control: the built-in row is on screen, locked, beside at least one other row.
    const builtIn = page.locator('[data-slot="list-row-root"]').filter({ hasText: PRESET_BUILT_IN_SUBTITLE });
    await expect(builtIn).toHaveCount(1);
    await expect(builtIn.locator('[data-slot="list-row-subtitle"] svg')).toHaveCount(1);
    const titles = page.locator('[data-slot="list-row-title"]');
    await expect.poll(() => titles.count()).toBeGreaterThan(1);
    const lefts = await titles.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
    expect(new Set(lefts).size).toBe(1);
  });
});

test.describe("phone portrait", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("a revealed last tab leaves the start edge of the strip dissolving over the tabs that scrolled out", async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    const appearance = appearanceSettingsSchema.parse({});
    await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearance });
    await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
    const preset = await caller.preset.create({ name: "Strip cue witness", kind: "generation" });
    await routeTrpc(page, serveCorpusProcedures(caller, READS));
    await mount<typeof PresetActionGroupsStory>(STORY, { width: 390, appearance, subject: "editor", presetId: preset.id });
    const editor = page.getByRole("region", { name: PRESET_EDITOR_NAME, exact: true });
    const tabs = editor.getByRole("tablist", { name: PRESET_SECTIONS_NAME, exact: true });
    const strip = tabs.locator("..");
    const last = tabs.getByRole("tab").last();
    const resting = await strip.evaluate((node) => ({ fade: node.hasAttribute("data-fade-start"), mask: getComputedStyle(node).maskImage }));
    // The control: before the reveal the strip rests at its start, so nothing lies past that edge and it does not dissolve.
    expect(resting.fade).toBe(false);
    await last.click();
    await expect(last).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => strip.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
    await expect(strip).toHaveAttribute("data-fade-start", "");
    const revealed = await strip.evaluate((node) => getComputedStyle(node).maskImage);
    expect(revealed).not.toBe(resting.mask);
  });
});
