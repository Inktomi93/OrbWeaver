// A style element a card author or the greeting studio wrote prints no CSS in the card's previews: the hero's greeting,
// the studio's preview and the example transcript draw the prose around it, unstyled. Production entry: the Characters
// section's editor content over a real server.
// @subject packages/client/src/features/character/components/character-greeting-preview.tsx
// @subject packages/client/src/features/character/components/greeting-studio.tsx
// @subject packages/client/src/features/character/components/character-facet-editor.tsx

import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { CharacterId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_EXPAND_TO_EDIT_NAME, CHARACTER_FACET_LABELS } from "#client/features/character/lib/character-names.ts";
import { GREETING_REWRITE_NAME, GREETING_STUDIO_NAME } from "#client/features/character/lib/greeting-copy.ts";
import type { CharacterRemainingActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORY = "tests/client/features/character/components/_remaining-action-groups-stories/CharacterRemainingActionsStory";
const CSS_MARK = "card-author-mark";
const styled = (prose: string): string => `<style>.${CSS_MARK}{color:red}\n\n.${CSS_MARK} b{margin:0}</style>${prose}`;
const GREETING = "The archivist opens the door.";
const REWRITTEN = "The archivist lowers the lantern.";
const EXAMPLE = "The archivist nods.";

test.use({ viewport: { width: 1280, height: 900 } });

/** The editor over a card whose greeting and example dialogue each open with a stylesheet. */
async function openStyledCard(
  page: Page,
  corpus: { readonly auth: { readonly signedInConfig: Parameters<typeof routeAuthConfig>[1] } },
): Promise<{ readonly root: Awaited<ReturnType<typeof createCorpusHarness>>; readonly characterId: CharacterId }> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: styled(REWRITTEN),
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness(undefined, { startJobs: false, providerFetch: provider.execute }));
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "card-author-style-archivist",
      name: "The styled archivist",
      description: "An archivist keeps the lamps lit.",
      greetings: [{ text: styled(GREETING) }],
      exampleMessages: `<START>\n{{char}}: ${styled(EXAMPLE)}`,
    }),
  });
  const connection = (await caller.connection.list()).find((item) => item.model === CORPUS_TEXT_MODEL);
  if (connection === undefined) {
    throw new Error("The corpus has no greeting completion connection");
  }
  await caller.connection.setBinding({ task: "summarize", connectionId: connection.id });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "character.get",
      "character.list",
      "character.update",
      "character.rewriteGreeting",
      "preset.get",
      "plugin.listMacros",
      "chat.listChats",
      "regex.listForCharacter",
      "tag.listPendingSuggestions",
    ]),
  );
  construction.move();
  return { root, characterId: card.id };
}

// The prose a region draws, with no stylesheet text in it.
async function proseWithoutCss(region: Locator, prose: string): Promise<boolean> {
  await region.getByText(prose, { exact: false }).first().waitFor();
  return !((await region.textContent()) ?? "").includes(CSS_MARK);
}

const editorProps = (characterId: CharacterId): Parameters<typeof CharacterRemainingActionsStory>[0] => ({
  characterId,
  plane: "editor" as const,
  width: 960,
  appearance: appearanceSettingsSchema.parse({}),
});

test("the hero's greeting draws its prose and none of its stylesheet", async ({ corpus, mount, page }) => {
  const opened = await openStyledCard(page, corpus);
  await using _root = opened.root;
  await mount<typeof CharacterRemainingActionsStory>(STORY, editorProps(opened.characterId));
  expect(await proseWithoutCss(page.locator('[data-slot="character-greeting-bubble"]'), GREETING)).toBe(true);
});

test("the greeting studio's preview of a rewrite draws its prose and none of its stylesheet", async ({ corpus, mount, page }) => {
  const opened = await openStyledCard(page, corpus);
  await using _root = opened.root;
  await mount<typeof CharacterRemainingActionsStory>(STORY, editorProps(opened.characterId));
  const hero = page.locator('[data-slot="character-hero"]');
  await hero.getByRole("button", { name: GREETING_STUDIO_NAME, exact: true }).click();
  await hero.getByRole("button", { name: GREETING_REWRITE_NAME, exact: true }).click();
  expect(await proseWithoutCss(hero.locator('[data-slot="greeting-studio-preview"]'), REWRITTEN)).toBe(true);
});

test("the example transcript draws each exchange's prose and none of its stylesheet", async ({ corpus, mount, page }) => {
  const opened = await openStyledCard(page, corpus);
  await using _root = opened.root;
  await mount<typeof CharacterRemainingActionsStory>(STORY, editorProps(opened.characterId));
  await page.getByRole("button", { name: CHARACTER_FACET_LABELS.exampleMessages }).click();
  // The drill-in shows the transcript above its edit toggle, not the editor.
  const transcript = page.getByRole("button", { name: CHARACTER_EXPAND_TO_EDIT_NAME }).locator("xpath=..");
  expect(await proseWithoutCss(transcript, EXAMPLE)).toBe(true);
});
