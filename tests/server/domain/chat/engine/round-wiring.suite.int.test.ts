// @subject packages/server/src/domain/chat/verbs/turn.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { characters, messages } from "@orb/db";
import { createChatRoot } from "@orb/testkit/node/chat/composed.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq } from "drizzle-orm";

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
  const group = await h.root.db
    .select()
    .from(characters)
    .where(and(eq(characters.ownerId, h.owner.userId), eq(characters.synthetic, true)))
    .get();
  if (group === undefined) {
    throw new Error("the real narrator round did not mint its group character");
  }
  expect(h.characters.map(({ id }) => id)).not.toContain(group.id);
  expect(narrators.map(({ characterId }) => characterId)).toEqual([group.id]);
  expect(
    await h.root.db
      .select({ role: messages.role, kind: messages.kind, characterId: messages.characterId })
      .from(messages)
      .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant"))),
  ).toEqual([{ role: "assistant", kind: "narrator", characterId: group.id }]);
});
