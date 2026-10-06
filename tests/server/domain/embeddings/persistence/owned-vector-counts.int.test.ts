import { chatParticipants } from "@orb/db";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { and, eq } from "drizzle-orm";
import { seedAsset } from "../../../../support/factories/asset.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { seedChat } from "../../../../support/factories/chat.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  seedCharacterEmbedding,
  seedChatDigest,
  seedChatParticipant,
  seedChatSegment,
  seedDocument,
  seedDocumentChunk,
  seedImageEmbedding,
} from "../../search/_support.ts";
import { makeStoreHarness } from "../_support.ts";

test("vector counts use producer ownership and only present human hosts, never character ownership or a member seat", async ({ db, ids }) => {
  const a = await seedUser(db);
  const b = await seedUser(db);
  const vector = new Float32Array([1, 0, 0, 0]);
  const rooms: Awaited<ReturnType<typeof seedChat>>[] = [];
  for (const owner of [a, b]) {
    const card = await seedCharacter(db, { ownerId: owner.id });
    const asset = await seedAsset(db, { ownerId: owner.id });
    const room = await seedChat(db);
    rooms.push(room);
    await seedChatParticipant(db, room.id, owner.id, "host");
    await seedCharacterEmbedding(db, { characterId: card.id, embedding: vector });
    await seedImageEmbedding(db, { assetId: asset.id, embedding: vector });
    const document = await seedDocument(db, { ownerId: owner.id, id: ids.next(ID_PREFIX.document) });
    await seedDocumentChunk(db, { documentId: document, chunkIdx: 0, embedding: vector });
    await seedChatDigest(db, { chatId: room.id, scopedCharacterId: card.id, blockIdx: 0, embedding: vector });
    await seedChatSegment(db, { chatId: room.id, blockIdx: 0, embedding: vector });
  }
  const [ownRoom, foreignRoom] = rooms;
  if (ownRoom === undefined || foreignRoom === undefined) {
    throw new Error("two host rooms required");
  }
  await seedChatParticipant(db, foreignRoom.id, a.id, "member");
  const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
  expect(await svc.countOwnedVectors(a.id)).toEqual({ cards: 1, memory: 2, documents: 1, images: 1 });
  expect(await svc.countOwnedVectors(b.id)).toEqual({ cards: 1, memory: 2, documents: 1, images: 1 });
  const seat = and(eq(chatParticipants.chatId, ownRoom.id), eq(chatParticipants.userId, a.id));
  await db.update(chatParticipants).set({ leftSeq: 5 }).where(seat);
  expect(await svc.countOwnedVectors(a.id)).toEqual({ cards: 1, memory: 0, documents: 1, images: 1 });
  await db.update(chatParticipants).set({ leftSeq: null, role: "member" }).where(seat);
  expect(await svc.countOwnedVectors(a.id)).toEqual({ cards: 1, memory: 0, documents: 1, images: 1 });
  await db.update(chatParticipants).set({ role: "host" }).where(seat);
  expect(await svc.countOwnedVectors(a.id)).toEqual({ cards: 1, memory: 2, documents: 1, images: 1 });
  expect(await svc.countOwnedVectors(castId(ids.next("user")))).toEqual({ cards: 0, memory: 0, documents: 0, images: 0 });
});
