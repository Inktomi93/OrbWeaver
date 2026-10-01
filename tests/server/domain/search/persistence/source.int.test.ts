import { chatSegments } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { readSourceSpan } from "../../../../../packages/server/src/domain/search/persistence/source.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedMessage } from "../../chat/_support.ts";
import { seedChat, seedChatSegment, vec } from "../_support.ts";

test("coverage includes every same-generation chunk, rejects incomplete blocks and floors only stable endpoints", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, mintTypeId(ID_PREFIX.chat));
  const firstId = await seedChatSegment(db, { chatId, blockIdx: 4, embedding: vec(1) });
  await seedChatSegment(db, { chatId, blockIdx: 5, embedding: vec(1) });
  const chunk = await seedChatSegment(db, { chatId, blockIdx: 5, chunkIdx: 1, embedding: vec(1) });
  await db.update(chatSegments).set({ seqEnd: 88 }).where(eq(chatSegments.id, chunk));
  const foreignGeneration = await seedChatSegment(db, { chatId, blockIdx: 5, chunkIdx: 2, embedding: vec(1), model: "other-generation" });
  await db.update(chatSegments).set({ seqEnd: 999 }).where(eq(chatSegments.id, foreignGeneration));
  const [first] = await db.select({ generationId: chatSegments.generationId }).from(chatSegments).where(eq(chatSegments.id, firstId));
  if (first === undefined) {
    throw new Error("missing source generation");
  }
  await seedMessage(db, chatId, 40);
  const visible = await seedMessage(db, chatId, 50);
  const end = await seedMessage(db, chatId, 80);
  const source = { chatId, generationId: first.generationId };
  expect(await readSourceSpan(db, source, { startIdx: 4, endIdx: 5 }, 50)).toEqual({
    seqStart: 40,
    seqEnd: 88,
    messageStartId: visible.messageId,
    messageEndId: end.messageId,
  });
  expect(await readSourceSpan(db, source, { startIdx: 4, endIdx: 6 }, 50)).toEqual({ seqStart: null, seqEnd: null, messageStartId: null, messageEndId: null });
  expect(await readSourceSpan(db, source, { startIdx: 4, endIdx: 5 }, null)).toEqual({ seqStart: 40, seqEnd: 88, messageStartId: null, messageEndId: null });
});
