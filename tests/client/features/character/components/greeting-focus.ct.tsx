import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { CharacterExampleLifetimeStory } from "./_example-lifetime-stories.tsx";

test("removing an alternate opening returns focus to Add opening", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const character = (await caller.character.list({ limit: 1 })).items[0];
  if (character === undefined) {
    throw new Error("The corpus has no character");
  }
  await caller.character.update({ characterId: character.id, input: { greetings: [{ text: "First opening" }, { text: "Alternate opening" }] } });
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "character.get",
      "character.update",
      "preset.get",
      "chat.listChats",
      "regex.listForCharacter",
      "tag.listPendingSuggestions",
    ]),
  );
  await mount<typeof CharacterExampleLifetimeStory>("tests/client/features/character/components/_example-lifetime-stories/CharacterExampleLifetimeStory", {
    characterId: character.id,
  });
  const greeting = page.locator('[data-slot="character-greeting"]');
  await greeting.getByRole("button", { name: "Opening 2", exact: true }).click();
  await greeting.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(greeting.getByRole("textbox", { name: "Opening 2", exact: true })).toHaveValue("Alternate opening");
  await greeting.getByRole("button", { name: "Remove opening", exact: true }).click();
  await expect(greeting.getByRole("button", { name: "Add opening", exact: true })).toBeFocused();
  await expect(greeting.getByRole("textbox", { name: "Opening 1", exact: true })).toHaveValue("First opening");
});
