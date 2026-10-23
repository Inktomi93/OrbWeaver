// @subject packages/server/src/domain/chat/verbs/turn.ts
import { closeDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  freshCountedDb,
} from "@orb/testkit/node/composed";

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
  const body = "x".repeat(2048);
  const reasoning = "y".repeat(2048);
  // An established room: alternating reasoning-bearing replies and owner lines, written by the native import.
  const transcript = Array.from({ length: 120 }, (_, index) =>
    index % 2 === 1 ? { role: "user" as const, content: body } : { role: "assistant" as const, content: body, reasoning },
  );
  const h = ownership.use(await createChatRoot({ providerFetch: physical.execute, server: { db }, memoryEnabled: false, transcript }));
  queries.reset();
  const committed = await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "next" });
  const fullTranscriptReads = queries
    .statements()
    .filter((statement) => statement.includes('"message_variants"."content"') && statement.includes('"message_variants"."reasoning"'));
  expect(committed.messages[0]?.role).toBe("user");
  expect(fullTranscriptReads).toHaveLength(1);
  expect(physical.requests.filter((request) => request === "POST /v1/chat/completions")).toEqual([]);
});
