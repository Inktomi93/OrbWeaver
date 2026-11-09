// @subject packages/client/src/features/character/components/character-facet-editor.tsx
// A card field a turn renders completes the active preset's macros; creator notes render only in the member card
// viewer, which registers no user macros, so they complete the builtins alone.

import { characterDetailSchema } from "@orb/contracts/character";
import { userMacroSchema } from "@orb/contracts/preset";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { makePromptConfig } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { CHARACTER_CREATOR_NOTES_FACET_NAME, CHARACTER_DESCRIPTION_FACET_NAME } from "#client/features/character/lib/character-names.ts";
import type { CharacterMacroCompletionStory } from "./_macro-completion-stories.tsx";

const PRESET_MACRO = "house_rule";

test("a turn-rendered card field offers the preset's macro and creator notes offer the builtins alone", async ({ corpus, mount, page }) => {
  const character = corpus.reads["character.list"][0]?.output.items[0];
  if (character === undefined) {
    throw new Error("Committed character library must include a card");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({
    name: "House preset",
    kind: "custom",
    config: makePromptConfig({ userMacros: [userMacroSchema.parse({ name: PRESET_MACRO, description: "A house rule.", body: "Be kind." })] }),
  });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "character.get",
      "preset.get",
      "plugin.listMacros",
      "chat.listChats",
      "regex.listForCharacter",
      "tag.listPendingSuggestions",
    ]),
  );
  await mount<typeof CharacterMacroCompletionStory>("tests/client/features/character/components/_macro-completion-stories/CharacterMacroCompletionStory", {
    characterId: characterDetailSchema.shape.id.parse(character.id),
  });
  const option = (name: string): ReturnType<typeof page.locator> => page.locator('[data-slot="macro-textarea-option"]', { hasText: `{{${name}}}` });

  await page.getByRole("button", { name: /Description/ }).click();
  await page.getByRole("textbox", { name: CHARACTER_DESCRIPTION_FACET_NAME, exact: true }).fill("{{house_ru");
  await expect(option(PRESET_MACRO)).toBeVisible();
  await page.getByRole("button", { name: /Back/ }).click();

  await page.getByRole("button", { name: /Creator notes/ }).click();
  const notes = page.getByRole("textbox", { name: CHARACTER_CREATOR_NOTES_FACET_NAME, exact: true });
  await notes.fill("{{char");
  await expect(option("char")).toBeVisible();
  await notes.fill("{{house_ru");
  await expect(option(PRESET_MACRO)).toHaveCount(0);
});
