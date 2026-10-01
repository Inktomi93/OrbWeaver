import { chatParticipants, chatSegments } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createSourceState } from "@orb/server/domain/search";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant } from "../../chat/_support.ts";
import { seedChatSegment, vec } from "../_support.ts";

test("source generation authority follows the present human host through handoff", async () => {
  const db = await freshDb();
  const host = await seedUser(db);
  const successor = await seedUser(db);
  const chatId = await seedChat(db, "source", { id: mintTypeId(ID_PREFIX.chat) });
  const seat = await seedParticipant(db, { chatId, key: "host", userId: host.id, role: "host" });
  const rowId = await seedChatSegment(db, { chatId, blockIdx: 2, embedding: vec(1) });
  const [row] = await db.select().from(chatSegments).where(eq(chatSegments.id, rowId));
  if (row === undefined) {
    throw new Error("missing source row");
  }
  const source = {
    kind: "segment" as const,
    rowId,
    chatId,
    generationId: row.generationId,
    fingerprint: null,
    contentHash: row.contentHash,
    blockIdx: row.blockIdx,
    chunkIdx: row.chunkIdx,
    seqStart: row.seqStart,
    seqEnd: row.seqEnd,
    messageStartId: null,
    messageEndId: null,
  };
  const read = createSourceState({ db });
  expect((await read(source)).generationFingerprint).not.toBeNull();
  await db.update(chatParticipants).set({ leftSeq: 30 }).where(eq(chatParticipants.id, seat));
  await seedParticipant(db, { chatId, key: "successor", userId: successor.id, role: "host" });
  expect(await read(source)).toMatchObject({ generationFingerprint: null, contentHash: row.contentHash, sourceSpanMatches: true });
});
