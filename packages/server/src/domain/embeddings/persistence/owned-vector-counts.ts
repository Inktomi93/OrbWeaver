// How many vectors one owner has stored per scope — what an embedder change would delete and re-embed.
// Ownership derives from each producer (D20): cards via characters, memory via present hosted chats,
// documents via documents, images via assets.

import type { VectorScope } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { assets, characterEmbeddings, characters, chatDigests, chatParticipants, chatSegments, documentChunks, documents, imageEmbeddings } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, count, eq, inArray, isNull } from "drizzle-orm";

export async function countOwnedVectors(db: Db, ownerId: UserId): Promise<Readonly<Record<VectorScope, number>>> {
  const hostedChats = db
    .select({ id: chatParticipants.chatId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.userId, ownerId), eq(chatParticipants.kind, "human"), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)));
  const [cards, digests, segments, chunks, images] = await Promise.all([
    db
      .select({ n: count() })
      .from(characterEmbeddings)
      .innerJoin(characters, eq(characters.id, characterEmbeddings.characterId))
      .where(eq(characters.ownerId, ownerId)),
    db.select({ n: count() }).from(chatDigests).where(inArray(chatDigests.chatId, hostedChats)),
    db.select({ n: count() }).from(chatSegments).where(inArray(chatSegments.chatId, hostedChats)),
    db.select({ n: count() }).from(documentChunks).innerJoin(documents, eq(documents.id, documentChunks.documentId)).where(eq(documents.ownerId, ownerId)),
    db.select({ n: count() }).from(imageEmbeddings).innerJoin(assets, eq(assets.id, imageEmbeddings.assetId)).where(eq(assets.ownerId, ownerId)),
  ]);
  return {
    cards: cards[0]?.n ?? 0,
    memory: (digests[0]?.n ?? 0) + (segments[0]?.n ?? 0),
    documents: chunks[0]?.n ?? 0,
    images: images[0]?.n ?? 0,
  };
}
