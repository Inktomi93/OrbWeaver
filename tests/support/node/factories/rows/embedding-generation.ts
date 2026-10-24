// Embedding and memory rows a production pass left, read behind the rows door for persistence-tier and corpus captures.

import type { Db } from "@orb/db";
import {
  characterEmbeddings,
  characters,
  chatDigestSpeakers,
  chatDigests,
  chatSegments,
  documentChunks,
  embeddingCalls,
  embedGenerations,
  embedGenerationTargets,
  embedSpaceState,
  imageAnalyses,
  imageEmbeddings,
  imageIndexSkips,
} from "@orb/db";
import type { ChatId, DocumentId } from "@orb/kit/ids";
import type { EmbeddingsService } from "@orb/server/domain/embeddings";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { CapturedChatMemoryRows, DocumentChunkRow, SeededEmbeddedCorpus, SeededEmbeddingGeneration, SeededIndexedAsset } from "../embedding-generation.ts";

/** Capture actual ingestion output; chunk boundaries, vector geometry and identities remain producer-owned. */
export async function captureDocumentChunks(db: Db, documentId: DocumentId): Promise<readonly DocumentChunkRow[]> {
  return await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId)).orderBy(documentChunks.chunkIdx, documentChunks.id);
}

/** Capture the actual generated chat rows; an absent speaker projection stays absent. */
export async function captureChatMemoryRows(db: Db, chatId: ChatId): Promise<CapturedChatMemoryRows> {
  const [digests, segments, speakers] = await Promise.all([
    db.select().from(chatDigests).where(eq(chatDigests.chatId, chatId)).orderBy(chatDigests.id),
    db.select().from(chatSegments).where(eq(chatSegments.chatId, chatId)).orderBy(chatSegments.id),
    db
      .select({ row: chatDigestSpeakers })
      .from(chatDigestSpeakers)
      .innerJoin(chatDigests, eq(chatDigests.id, chatDigestSpeakers.digestId))
      .where(eq(chatDigests.chatId, chatId))
      .orderBy(chatDigestSpeakers.digestId, chatDigestSpeakers.characterId),
  ]);
  return { digests, segments, speakers: speakers.map(({ row }) => row) };
}

export async function seedEmbeddingGeneration(
  root: ServerProducerRoot,
  params: Parameters<EmbeddingsService["resolveGeneration"]>,
): Promise<SeededEmbeddingGeneration> {
  const db = root.db;
  const resolveGeneration = root.app.embeddings.resolveGeneration;
  const resolved = await resolveGeneration(...params);
  if (resolved === null) {
    throw new Error("production embedding resolution produced no generation");
  }
  const [generation, target] = await Promise.all([
    db.select().from(embedGenerations).where(eq(embedGenerations.id, resolved.id)).get(),
    db
      .select()
      .from(embedGenerationTargets)
      .where(and(eq(embedGenerationTargets.ownerId, params[0]), eq(embedGenerationTargets.task, resolved.task)))
      .get(),
  ]);
  if (generation === undefined || target === undefined) {
    throw new Error("production generation resolution left no canonical generation/target rows");
  }
  if (target.generationId !== resolved.id || target.epoch !== resolved.epoch) {
    throw new Error("production embedding target changed before its resolved receipt was captured");
  }
  return { generation, target };
}

/** The real sweep owns card text, hashing, vector execution and completion; a target is not promotion proof. */
export async function seedEmbeddedCorpus(
  root: ServerProducerRoot,
  params: Parameters<EmbeddingsService["embedCorpus"]>[0] & {
    readonly ownerId: NonNullable<Parameters<EmbeddingsService["embedCorpus"]>[0]["ownerId"]>;
  },
): Promise<SeededEmbeddedCorpus> {
  const db = root.db;
  const embedCorpus = root.app.embeddings.embedCorpus;
  const result = await embedCorpus(params);
  const rows = await db
    .select({ row: characterEmbeddings })
    .from(characterEmbeddings)
    .innerJoin(characters, eq(characters.id, characterEmbeddings.characterId))
    .where(eq(characters.ownerId, params.ownerId))
    .orderBy(characterEmbeddings.characterId, characterEmbeddings.generationId);
  const calls = await db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, params.ownerId)).orderBy(embeddingCalls.id);
  const states = await db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, params.ownerId)).orderBy(embedSpaceState.scope);
  return { result, vectors: rows.map(({ row }) => row), calls, states };
}

/** Caption/fallback/skip semantics remain the actual indexer's; null receipts do not manufacture a vector. */
export async function seedIndexedAsset(root: ServerProducerRoot, params: Parameters<EmbeddingsService["indexAsset"]>): Promise<SeededIndexedAsset> {
  const db = root.db;
  const indexAsset = root.app.embeddings.indexAsset;
  const result = await indexAsset(...params);
  const [vectors, analysis, skip] = await Promise.all([
    db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, params[0])).orderBy(imageEmbeddings.generationId, imageEmbeddings.lens),
    db.select().from(imageAnalyses).where(eq(imageAnalyses.assetId, params[0])).get(),
    db.select().from(imageIndexSkips).where(eq(imageIndexSkips.assetId, params[0])).get(),
  ]);
  return { result, vectors, analysis, skip };
}
