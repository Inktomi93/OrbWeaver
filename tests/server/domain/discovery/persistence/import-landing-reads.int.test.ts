// The library reads that reach messages by character, not through a room's roster, leave out a room an import is still
// landing: the forgotten-gems shelf and the scenes a card question is grounded in count the room once it has landed.
// @subject packages/server/src/domain/discovery/persistence/message-reads.ts
import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness, TranscriptLine } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  seedTranscript,
  transcriptFile,
} from "@orb/testkit/node/composed";
import { duringChatLanding } from "@orb/testkit/node/rows";
import { LANDING_STAGE_ROWS } from "#server/domain/chat/persistence/import-landing.ts";

const LANDED = "first-keeper";
const LANDING = "second-keeper";
const LANDING_SCENE = "the second keeper counts the lamps";
const ASK_REPLY = "card_answer";
// A one-line message is two rows, so this is several landing stages.
const ROOM_MESSAGES = 4 * (LANDING_STAGE_ROWS / 2) + 1;

function transcriptLines(messageCount: number, scene: string): TranscriptLine[] {
  return Array.from({ length: messageCount }, (_, turn) => ({ role: turn % 2 === 0 ? "user" : "assistant", content: `${scene} ${String(turn)}` }));
}

function startLanding(root: ServerTestHarness, handle: string, scene: string): Promise<unknown> {
  const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
  if (descriptor === undefined) {
    throw new Error("the production chat import descriptor is missing");
  }
  return descriptor.importFile(
    root.ownerId,
    transcriptFile({ characterHandles: [handle], lines: transcriptLines(ROOM_MESSAGES, scene), chat: { title: "long" } }),
  );
}

async function createCard(root: ServerTestHarness, handle: string): Promise<CharacterId> {
  const principal = await root.principalFor(root.ownerId);
  const card = await root.services.character.create({
    principal,
    input: createCharacterSchema.parse({ handle, name: handle, description: `${handle} keeps the lamps on the stair.` }),
  });
  return card.id;
}

test("the forgotten-gems shelf leaves out a card whose only room is still landing, and shelves it once landed", async () => {
  await using root = await createServerHarness();
  const landedCard = await createCard(root, LANDED);
  const landingCard = await createCard(root, LANDING);
  await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [LANDED], lines: transcriptLines(2, "the first keeper") });
  const shelf = async (): Promise<readonly CharacterId[]> => (await root.services.discovery.forgottenGems(root.ownerId)).map((gem) => gem.characterId);

  const landing = startLanding(root, LANDING, LANDING_SCENE);
  const seen = await duringChatLanding(root.db, landing, shelf);
  expect(await landing).toMatchObject({ ok: true, created: true });

  expect(seen.stillLanding).toBe(true);
  expect(seen.result).toEqual([landedCard]);
  // The control: once landed, the card's scenes put it on the shelf.
  expect(new Set(await shelf())).toEqual(new Set([landedCard, landingCard]));
});

test("a card question is grounded in no scene of a room still landing, and in its scenes once landed", async () => {
  const askPrompts: string[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: (body) => {
      if (body.includes(ASK_REPLY)) {
        askPrompts.push(body);
      }
    },
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const card = await createCard(root, LANDING);
  expect(await root.services.discovery.distillCharacters({ ownerId: root.ownerId, funderUserId: root.ownerId, characterId: card })).toMatchObject({
    distilled: 1,
  });
  await seedTranscript(root, { ownerId: root.ownerId, characterHandles: [LANDING], lines: transcriptLines(2, "the landed keeper") });
  const asked = async (): Promise<string> => {
    askPrompts.length = 0;
    expect(await root.services.discovery.askCard(root.ownerId, card, "Which lamps does the keeper count?")).not.toBeNull();
    return askPrompts.join("\n");
  };

  const landing = startLanding(root, LANDING, LANDING_SCENE);
  const seen = await duringChatLanding(root.db, landing, asked);
  expect(await landing).toMatchObject({ ok: true, created: true });

  expect(seen.stillLanding).toBe(true);
  // The control in the same prompt: the landed room's scene grounds the answer, the landing room's do not.
  expect({ landed: seen.result.includes("the landed keeper"), landing: seen.result.includes(LANDING_SCENE) }).toEqual({ landed: true, landing: false });
  expect((await asked()).includes(LANDING_SCENE)).toBe(true);
});
