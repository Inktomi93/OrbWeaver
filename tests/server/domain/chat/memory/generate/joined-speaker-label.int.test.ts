// @subject packages/server/src/domain/chat/memory/generate/substrate/transcript.ts
// @subject packages/server/src/domain/chat/memory/generate/digests.ts
// A character that joins mid-room and then speaks reaches the summarizer by display name, never by its id.
import { createCharacterSchema } from "@orb/contracts/character";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";

const OPENING = "The lantern is lit above the bridge.";
const JOINED = "The late witness answers from the far bank.";

test("a block built after a just-joined character's first reply names both speakers by display name", async () => {
  const replies = [OPENING, JOINED];
  const summaries: string[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body): string => {
      if (body.includes("Transcript block:")) {
        summaries.push(body);
        return "Bridge scene\nThe lantern is lit and a witness answers.\nKeywords: bridge";
      }
      const reply = replies.shift();
      if (reply === undefined) {
        throw new Error("the scripted reply plan is exhausted");
      }
      return reply;
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    providerFetch: physical.execute,
    memoryEnabled: true,
    memoryDefaults: { mode: "mixA", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
    group: { output: "per-speaker", cardScope: "scoped", policy: "list" },
  });
  const first = h.characters[0];
  if (first === undefined) {
    throw new Error("the memory room has no founding character");
  }
  expect((await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: first.id })).aborted).toBe(false);
  await h.root.settleBackground();
  const late = await h.caller.character.create({
    input: createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "A late witness to the bridge." }),
  });
  await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: late.id });
  expect((await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: late.id })).aborted).toBe(false);
  await h.root.settleBackground();

  expect(replies).toEqual([]);
  expect(summaries.length).toBeGreaterThan(0);
  for (const body of summaries) {
    expect(body).toContain(`${first.name}: ${OPENING}`);
    expect(body).toContain(`Bryn: ${JOINED}`);
    expect(body).not.toContain(`${ID_PREFIX.character}_`);
  }
});
