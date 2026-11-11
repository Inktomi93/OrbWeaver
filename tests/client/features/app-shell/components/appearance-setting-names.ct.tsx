// The Looks note points a person at an Appearance setting by the label its section's model gives it, so each control the Sizing and Effects
// sections render for a setting a theme import can leave behind must wear that same label. The sections are the production ones over a
// corpus root.
// @subject packages/client/src/features/app-shell/components/appearance-effects-section.tsx
import { THEME_LEFTOVER_APPEARANCE_SETTINGS } from "@orb/contracts/portability";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { APPEARANCE_EFFECTS_SUBCATEGORY } from "#client/features/app-shell/lib/appearance-effects-model.ts";
import { APPEARANCE_SIZING_SUBCATEGORY } from "#client/features/app-shell/lib/appearance-sizing-model.ts";
import type { EffectsSectionStory, SizingSectionStory } from "./_appearance-sizing-stories.tsx";

const STORIES = {
  sizing: "tests/client/features/app-shell/components/_appearance-sizing-stories/SizingSectionStory",
  effects: "tests/client/features/app-shell/components/_appearance-sizing-stories/EffectsSectionStory",
} as const;
const SECTIONS = [
  { section: "sizing", model: APPEARANCE_SIZING_SUBCATEGORY },
  { section: "effects", model: APPEARANCE_EFFECTS_SUBCATEGORY },
] as const;
const LEFTOVER_KEYS: ReadonlySet<string> = new Set(THEME_LEFTOVER_APPEARANCE_SETTINGS);

for (const { section, model } of SECTIONS) {
  test(`the ${section} section names each setting a theme import can leave behind by its model's label`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "settings.updateUserSettingsSection"]));
    await mount<typeof SizingSectionStory | typeof EffectsSectionStory>(STORIES[section], {});

    // A setting stored as a list (the Frosted glass surfaces) is a set of switches the pane names with the shared row's registry lead, not
    // with a label of its own, so there is no control name in the pane to compare.
    const named = (model.settings ?? []).filter(
      (leaf) => leaf.key !== undefined && LEFTOVER_KEYS.has(leaf.key) && !Array.isArray(Reflect.get(DEFAULT_APPEARANCE_SETTINGS, leaf.key)),
    );
    expect(named.length).toBeGreaterThan(0);
    for (const { label } of named) {
      await expect(page.getByLabel(label, { exact: true }).first()).toBeVisible();
    }
  });
}
