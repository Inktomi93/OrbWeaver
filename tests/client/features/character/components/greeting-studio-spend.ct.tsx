// @subject packages/client/src/features/character/components/greeting-studio.tsx
// The greeting studio's preview names what the run behind it cost, or says the provider reported none. Production entry:
// the Characters editor's hero band and its studio over a real server's generate verb, whose Utility connection either
// carries pricing (the provider's usage report prices the run) or none.

import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { Page, PlaywrightTestArgs } from "@playwright/test";
import { GREETING_MAKE_NEW_NAME, GREETING_STUDIO_NAME } from "#client/features/character/lib/greeting-copy.ts";
import type { CharacterRemainingActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORY = "tests/client/features/character/components/_remaining-action-groups-stories/CharacterRemainingActionsStory";
const GENERATED_OPENING = "The archivist lowers the lantern. A new visitor has reached the archive.";
const PROMPT_TOKENS = 1000;
const COMPLETION_TOKENS = 500;
const INPUT_PER_MTOK = 2;
const OUTPUT_PER_MTOK = 4;
// (1000 * $2 + 500 * $4) per million tokens, in the sub-cent form the money surfaces spell.
const PRICED_RUN_LINE = "$0.0040";
const SERVED = [
  "sessions.me",
  "settings.getUserSettings",
  "character.get",
  "character.list",
  "character.update",
  "character.generateGreeting",
  "preset.get",
  "plugin.listMacros",
  "chat.listChats",
  "regex.listForCharacter",
  "tag.listPendingSuggestions",
] as const;

interface StudioArgs {
  readonly priced: boolean;
  readonly corpus: CorpusPlayback;
  readonly mount: PlaywrightTestArgs["mount"];
  readonly page: Page;
  readonly corpusMedia: () => Promise<void>;
}

/** Opens the studio over a real room, makes one greeting and returns once its preview shows; the root lives until disposed. */
async function openStudio({ priced, corpus, mount, page, corpusMedia }: StudioArgs): Promise<AsyncDisposable> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: GENERATED_OPENING,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    usage: { promptTokens: PROMPT_TOKENS, completionTokens: COMPLETION_TOKENS },
  });
  await using construction = new AsyncDisposableStack();
  const root = construction.use(await createCorpusHarness(undefined, { startJobs: false, providerFetch: provider.execute }));
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "greeting-spend-archivist",
      name: "The greeting spend archivist",
      description: "An archivist keeps the lamps lit.",
    }),
  });
  if (priced) {
    const principal = await root.principalFor(root.ownerId);
    const connection = await root.services.connection.create({
      principal,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: CORPUS_TEXT_MODEL,
      allowBackground: true,
      declared: {
        kind: "generation",
        generation: { context: { window: 32_000 } },
        features: { detectServer: false, pricing: { inputPerMTok: INPUT_PER_MTOK, outputPerMTok: OUTPUT_PER_MTOK } },
      },
    });
    await caller.connection.setBinding({ task: "summarize", connectionId: connection.id });
  } else {
    const connection = (await caller.connection.list()).find((item) => item.model === CORPUS_TEXT_MODEL);
    if (connection === undefined) {
      throw new Error("The corpus has no greeting completion connection");
    }
    await caller.connection.setBinding({ task: "summarize", connectionId: connection.id });
  }
  // The control on the premise: the server's own answer for this binding, which the studio must show.
  const answer = await caller.character.generateGreeting({ characterId: card.id, steer: "", transforms: [], timeZone: "UTC" });
  expect(answer.costUsd === null).toBe(!priced);
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
  await corpusMedia();
  await mount<typeof CharacterRemainingActionsStory>(STORY, {
    characterId: card.id,
    plane: "editor",
    width: 960,
    appearance: appearanceSettingsSchema.parse({}),
  });
  const hero = page.locator('[data-slot="character-hero"]');
  await hero.getByRole("button", { name: GREETING_STUDIO_NAME, exact: true }).click();
  await hero.getByRole("button", { name: GREETING_MAKE_NEW_NAME, exact: true }).click();
  await expect(hero.locator('[data-slot="greeting-studio-preview"]')).toBeVisible();
  return construction.move();
}

test("a run the provider priced shows its spend beside the preview", async ({ corpus, mount, page, corpusMedia }) => {
  await using _room = await openStudio({ priced: true, corpus, mount, page, corpusMedia });
  await expect(page.locator('[data-slot="greeting-studio-spend"]')).toContainText(PRICED_RUN_LINE);
});

test("a run with no reported cost says the provider reported none", async ({ corpus, mount, page, corpusMedia }) => {
  await using _room = await openStudio({ priced: false, corpus, mount, page, corpusMedia });
  const spend = page.locator('[data-slot="greeting-studio-spend"]');
  await expect(spend).toBeVisible();
  await expect(spend).not.toContainText("$");
});
