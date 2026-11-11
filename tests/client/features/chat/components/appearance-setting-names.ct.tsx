// The Looks note points a person at an Appearance setting by the label its section's model gives it, so each control the chat feature's
// three Appearance sections render for a setting a theme import can leave behind must wear that same label. The sections are the
// production ones over a corpus root.
// @subject packages/client/src/features/chat/components/appearance-message-details-section.tsx
import { THEME_LEFTOVER_APPEARANCE_SETTINGS } from "@orb/contracts/portability";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { APPEARANCE_AVATARS_SUBCATEGORY } from "#client/features/chat/lib/appearance-avatars-model.ts";
import { APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY } from "#client/features/chat/lib/appearance-message-details-model.ts";
import { APPEARANCE_MESSAGE_STYLE_SUBCATEGORY } from "#client/features/chat/lib/appearance-message-style-model.ts";
import type { ChatAppearanceSectionStory } from "./_appearance-setting-names-stories.tsx";

const STORY = "tests/client/features/chat/components/_appearance-setting-names-stories/ChatAppearanceSectionStory";
const SECTIONS = [
  { section: "avatars", model: APPEARANCE_AVATARS_SUBCATEGORY },
  { section: "messageDetails", model: APPEARANCE_MESSAGE_DETAILS_SUBCATEGORY },
  { section: "messageStyle", model: APPEARANCE_MESSAGE_STYLE_SUBCATEGORY },
] as const;
const LEFTOVER_KEYS: ReadonlySet<string> = new Set(THEME_LEFTOVER_APPEARANCE_SETTINGS);

for (const { section, model } of SECTIONS) {
  test(`the ${section} section names each setting a theme import can leave behind by its model's label`, async ({ mount, page }) => {
    await using root = await createCorpusHarness();
    const caller = await root.internalCallerFor(root.ownerId);
    await routeTrpc(page, serveCorpusProcedures(caller, ["settings.getUserSettings", "settings.updateUserSettingsSection"]));
    await mount<typeof ChatAppearanceSectionStory>(STORY, { section });

    const named = (model.settings ?? []).filter((leaf) => leaf.key !== undefined && LEFTOVER_KEYS.has(leaf.key));
    expect(named.length).toBeGreaterThan(0);
    for (const { label } of named) {
      await expect(page.getByLabel(label, { exact: true }).first()).toBeVisible();
    }
  });
}
