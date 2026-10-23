// @subject packages/server/src/domain/chat/verbs/turn.ts
import { closeDb, messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  freshCountedDb,
  seedMessage,
} from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

test("an established-room commit does not reload the full selected transcript to decide first-turn status", async () => {
  const { db, queries } = await freshCountedDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(db));
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "No generation is requested.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = ownership.use(await createChatRoot({ providerFetch: physical.execute, server: { db }, memoryEnabled: false }));
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the real read-budget room has no seated character");
  }
  const body = "x".repeat(2048);
  const reasoning = "y".repeat(2048);
  for (let seq = 1; seq <= 120; seq += 1) {
    const user = seq % 2 === 0;
    const row = await seedMessage(
      db,
      {
        chatId: h.chatId,
        seq,
        role: user ? "user" : "assistant",
        authorUserId: user ? h.owner.userId : null,
        characterId: user ? null : character.id,
        content: body,
      },
      h.root.idSource,
    );
    if (!user) {
      await db.update(messageVariants).set({ reasoning }).where(eq(messageVariants.id, row.variantId));
    }
  }
  queries.reset();
  const committed = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "next" });
  const fullTranscriptReads = queries
    .statements()
    .filter((statement) => statement.includes('"message_variants"."content"') && statement.includes('"message_variants"."reasoning"'));
  expect(committed.messages[0]?.role).toBe("user");
  expect(fullTranscriptReads).toHaveLength(1);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual([]);
});
