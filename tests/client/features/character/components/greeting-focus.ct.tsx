import type { CharacterId } from "@orb/kit/ids";
import { expectCacheProse } from "@orb/testkit/browser/spec";
import type { createShellAmbientReads } from "@orb/testkit/ct";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  ADD_GREETING_NAME,
  FIRST_GREETING_ALWAYS_SHOWN_NOTE,
  GREETING_EDIT_NAME,
  greetingOrdinalLabel,
  REMOVE_GREETING_NAME,
} from "#client/features/character/lib/greeting-copy.ts";
import type { CharacterExampleLifetimeStory } from "./_example-lifetime-stories.tsx";

const STORY = "tests/client/features/character/components/_example-lifetime-stories/CharacterExampleLifetimeStory";

/** Gives the corpus's first character a first greeting and one alternate and serves the editor's reads; returns the card to mount. */
async function serveGreetingCard(
  root: Awaited<ReturnType<typeof createCorpusHarness>>,
  page: Page,
  corpus: Parameters<typeof createShellAmbientReads>[0],
): Promise<CharacterId> {
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
  return character.id;
}

test("removing an alternate greeting returns focus to Add greeting", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await mount<typeof CharacterExampleLifetimeStory>(STORY, { characterId: await serveGreetingCard(root, page, corpus) });
  const greeting = page.locator('[data-slot="character-greeting"]');
  await greeting.getByRole("button", { name: greetingOrdinalLabel(2), exact: true }).click();
  await greeting.getByRole("button", { name: GREETING_EDIT_NAME, exact: true }).click();
  await expect(greeting.getByRole("textbox", { name: greetingOrdinalLabel(2), exact: true })).toHaveValue("Alternate greeting");
  await greeting.getByRole("button", { name: REMOVE_GREETING_NAME, exact: true }).click();
  await expect(greeting.getByRole("button", { name: ADD_GREETING_NAME, exact: true })).toBeFocused();
  await expect(greeting.getByRole("textbox", { name: greetingOrdinalLabel(1), exact: true })).toHaveValue("First greeting");
});

test("the first greeting's always-shown note reads at the prose step inside the prose measure", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await mount<typeof CharacterExampleLifetimeStory>(STORY, { characterId: await serveGreetingCard(root, page, corpus) });
  const note = page.locator('[data-slot="character-greeting"]').getByText(FIRST_GREETING_ALWAYS_SHOWN_NOTE, { exact: true });
  await expect(note).toBeVisible();
  await expectCacheProse(note);
});
