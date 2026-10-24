// @subject packages/server/src/domain/chat/verbs/turn.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";

test("a public narrator round mints its real group character before committing the narrator's author", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The room answers together.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({
    providerFetch: provider.execute,
    characters: [
      createCharacterSchema.parse({ handle: "aria", name: "Aria", description: "A bold knight." }),
      createCharacterSchema.parse({ handle: "bryn", name: "Bryn", description: "An observant mage." }),
    ],
    group: { output: "narrator", policy: "list" },
  });
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "What happens next?" });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toHaveLength(2);
  expect(outcome.messages.filter(({ role }) => role === "user")).toHaveLength(1);
  const narrators = outcome.messages.filter(({ role }) => role === "assistant");
  expect(narrators).toHaveLength(1);
  const group = await h.root.services.character.findSyntheticGroupCharacter({ ownerId: h.owner.userId, chatId: h.chatId });
  if (group === null) {
    throw new Error("the real narrator round did not mint its group character");
  }
  expect(h.characters.map(({ id }) => id)).not.toContain(group.characterId);
  expect(narrators.map(({ characterId }) => characterId)).toEqual([group.characterId]);
  expect(
    (await readRoomCanon(h.root, h.owner, h.chatId))
      .filter(({ role }) => role === "assistant")
      .map(({ role, kind, characterId }) => ({ role, kind, characterId })),
  ).toEqual([{ role: "assistant", kind: "narrator", characterId: group.characterId }]);
});
