// The Characters hero shows one primary control. "New chat" is it at rest; while the greeting studio's preview is open its
// Accept finishes the step, so "New chat" steps back to the outline. Production entry: the Characters section's editor
// content (the hero band and its greeting studio) over a real server's rewrite verb.
import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { holdServed, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { GREETING_REWRITE_NAME, GREETING_STUDIO_NAME } from "#client/features/character/lib/greeting-copy.ts";
import { CHARACTER_NEW_CHAT_NAME } from "#client/lib/chat-launch-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { CharacterRemainingActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORY = "tests/client/features/character/components/_remaining-action-groups-stories/CharacterRemainingActionsStory";
const ORIGINAL_OPENING = "The archivist opens the door and waits for your answer.";
const GENERATED_OPENING = "The archivist lowers the lantern. A new visitor has reached the archive.";
const WIDTH = 960;
const PRIMARY = '[data-slot="button"][data-cta]';

test.use({ viewport: { width: 1280, height: 900 } });

test("the hero's New chat gives up the primary emphasis while a greeting preview is open", async ({ mount, page, corpus, corpusMedia }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: GENERATED_OPENING,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createCorpusHarness(undefined, { startJobs: false, providerFetch: provider.execute });
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "greeting-primary-archivist",
      name: "The greeting primary archivist",
      description: "An archivist keeps the lamps lit.",
      greetings: [{ text: ORIGINAL_OPENING }],
    }),
  });
  const connection = (await caller.connection.list()).find((item) => item.model === CORPUS_TEXT_MODEL);
  if (connection === undefined) {
    throw new Error("The corpus has no greeting completion connection");
  }
  await caller.connection.setBinding({ task: "summarize", connectionId: connection.id });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  const generation = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [
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
    ...serveCorpusProcedures(caller, ["character.rewriteGreeting"], () => generation),
  });
  await corpusMedia();
  await mount<typeof CharacterRemainingActionsStory>(STORY, {
    characterId: card.id,
    plane: "editor",
    width: WIDTH,
    appearance: appearanceSettingsSchema.parse({}),
  });

  const hero = page.locator('[data-slot="character-hero"]');
  const newChat = hero.getByRole("button", { name: CHARACTER_NEW_CHAT_NAME, exact: true });
  await expect(newChat).toBeVisible();
  // With no preview open the hero's New chat is its one primary control.
  await expect(newChat).toHaveAttribute("data-cta", "");
  await expect(hero.locator(PRIMARY)).toHaveCount(1);

  await hero.getByRole("button", { name: GREETING_STUDIO_NAME, exact: true }).click();
  await hero.getByRole("button", { name: GREETING_REWRITE_NAME, exact: true }).click();
  await generation.requested;
  generation.release();
  const preview = hero.locator('[data-slot="greeting-studio-preview"]');
  await expect(preview.getByText(GENERATED_OPENING, { exact: true })).toBeVisible();
  const accept = preview.getByRole("button", { name: DIALOG_VERBS.accept, exact: true });
  await expect(accept).toHaveAttribute("data-cta", "");
  await expect(newChat).not.toHaveAttribute("data-cta");
  await expect(hero.locator(PRIMARY)).toHaveCount(1);

  // Discarding the preview hands the emphasis back.
  await preview.getByRole("button", { name: DIALOG_VERBS.discard, exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(newChat).toHaveAttribute("data-cta", "");
  await expect(hero.locator(PRIMARY)).toHaveCount(1);
});
