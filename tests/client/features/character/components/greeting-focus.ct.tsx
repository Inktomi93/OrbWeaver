import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { ADD_GREETING_NAME, GREETING_EDIT_NAME, greetingOrdinalLabel, REMOVE_GREETING_NAME } from "#client/features/character/lib/greeting-copy.ts";
import type { CharacterExampleLifetimeStory } from "./_example-lifetime-stories.tsx";

test("removing an alternate greeting returns focus to Add greeting", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const character = (await caller.character.list({ limit: 1 })).items[0];
  if (character === undefined) {
    throw new Error("The corpus has no character");
  }
  await caller.character.update({ characterId: character.id, input: { greetings: [{ text: "First greeting" }, { text: "Alternate greeting" }] } });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "character.get",
      "character.update",
      "preset.get",
      "plugin.listMacros",
      "chat.listChats",
      "regex.listForCharacter",
      "tag.listPendingSuggestions",
    ]),
  );
  await mount<typeof CharacterExampleLifetimeStory>("tests/client/features/character/components/_example-lifetime-stories/CharacterExampleLifetimeStory", {
    characterId: character.id,
  });
  const greeting = page.locator('[data-slot="character-greeting"]');
  await greeting.getByRole("button", { name: greetingOrdinalLabel(2), exact: true }).click();
  await greeting.getByRole("button", { name: GREETING_EDIT_NAME, exact: true }).click();
  await expect(greeting.getByRole("textbox", { name: greetingOrdinalLabel(2), exact: true })).toHaveValue("Alternate greeting");
  await greeting.getByRole("button", { name: REMOVE_GREETING_NAME, exact: true }).click();
  await expect(greeting.getByRole("button", { name: ADD_GREETING_NAME, exact: true })).toBeFocused();
  await expect(greeting.getByRole("textbox", { name: greetingOrdinalLabel(1), exact: true })).toHaveValue("First greeting");
});
