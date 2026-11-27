// @subject packages/client/src/features/rpg/components/rpg-populate-control.tsx
// A card fill whose model reply was partly unusable says which parts were left out. The reply is the corpus wire's scripted
// populate answer, which carries one malformed gear entry beside valid parts; the server parses it and the toast reads the verdict.

import { createCharacterSchema } from "@orb/contracts/character";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { noticeToast, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
  seedRpgGame,
} from "@orb/testkit/node/composed";
import { populateDroppedNotice } from "#client/features/rpg/lib/rpg-names.ts";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const FILL_BUTTON = "Fill from card";
const CARD_NAME = "Populate traveller";
// The structured populate round is the only request that asks for a `sheet`; the gear entry below fails its schema (quantity 0).
const POPULATE_REPLY = JSON.stringify({
  sheet: { title: "Artificer", level: 2 },
  inventory: [
    { targetRef: CARD_NAME, add: [{ name: "Loom shuttle", location: "belt" }] },
    { targetRef: CARD_NAME, add: [{ name: "Malformed spare", quantity: 0 }] },
  ],
});

test("a card fill whose reply lost part of the gear says so, and names what still landed", async ({ mount, page }) => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The keeper preserves the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: (body) => (body.includes('"name":"rpg_state_extraction"') && body.includes('"sheet":') ? { text: POPULATE_REPLY, toolCalls: [] } : undefined),
  });
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
    providerFetch: physical.execute,
    startJobs: false,
  });
  const { connections } = await seedCorpusActors(root);
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Populate CT", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  await caller.connection.setBinding({ task: "chat", connectionId: connections.text.id });
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "populate-ct", name: CARD_NAME, description: "An artificer carrying a loom shuttle." }),
  });
  const chatId = (await caller.chat.startChat({ characterIds: [character.id], opening: "none" })).chat.id;
  await seedRpgGame(root, { principal, chatId, mode: "lite" });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.revealHidden",
      "rpg.populateFromCharacter",
    ]),
  );
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.status" });
  await page
    .locator('[data-slot="rpg-status-card"]')
    .filter({ hasText: CARD_NAME })
    .getByRole("button", { name: /^Open /u })
    .click();
  await page.getByRole("button", { name: FILL_BUTTON, exact: true }).click();

  await expect(noticeToast(page, populateDroppedNotice(CARD_NAME, true, ["inventory"]))).toBeVisible();
});
