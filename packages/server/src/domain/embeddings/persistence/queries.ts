// All db access for the store + hub-score write paths. A vector upsert never writes `hub_score` — it's
// absent from every `.values(...)` and `onConflictDoUpdate.set(...)` here; `hub_score` is written only by
// {@link writeHubScoreRows}. `existing*Hash` reads the stored `content_hash` so the verb can short-circuit a
// no-op before the expensive embed.

import type { ImageLens } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
import { characterEmbeddings, chatDigestSpeakers, chatDigests, chatSegments, documentChunks, imageEmbeddings } from "@orb/db";
import { batchMany, batchStmt } from "@orb/db/kit";
import type {
  AssetId,
  CharacterEmbeddingId,
  CharacterId,
  ChatDigestId,
  ChatId,
  ChatSegmentId,
  DocumentChunkId,
  DocumentId,
  ImageEmbeddingId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { HubScoreUpdate, VectorTable } from "../contract/params.ts";

const LIMIT_ONE = 1;

/** The stored `content_hash` for `(characterId, model)`, or `undefined` when no row exists yet. */
export async function existingCharacterHash(db: Db, characterId: CharacterId, model: string): Promise<string | undefined> {
  const rows = await db
    .select({ hash: characterEmbeddings.contentHash })
    .from(characterEmbeddings)
    .where(and(eq(characterEmbeddings.characterId, characterId), eq(characterEmbeddings.model, model)))
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The stored `content_hash` for `(assetId, model, lens)`, or `undefined` when no row exists yet. */
export async function existingImageHash(db: Db, assetId: AssetId, lens: ImageLens, model: string): Promise<string | undefined> {
  const rows = await db
    .select({ hash: imageEmbeddings.contentHash })
    .from(imageEmbeddings)
    .where(and(eq(imageEmbeddings.assetId, assetId), eq(imageEmbeddings.model, model), eq(imageEmbeddings.lens, lens)))
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The persistence-internal arg bundle for {@link upsertCharacterEmbedding} (file-local). */
interface UpsertCharacterInput {
  readonly id: CharacterEmbeddingId;
  readonly characterId: CharacterId;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  /** Epoch-ms from the injected clock — the insert's `created_at` (kept on a conflict update). */
  readonly now: number;
}

/** Upsert a card-text vector by `(characterId, model)`. On conflict updates `embedding`/`content_hash`/`dim`
 *  only — `hub_score`, `model`, `created_at` are left as-is. */
export async function upsertCharacterEmbedding(db: Db, input: UpsertCharacterInput): Promise<void> {
  await db
    .insert(characterEmbeddings)
    .values({
      id: input.id,
      characterId: input.characterId,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [characterEmbeddings.characterId, characterEmbeddings.model],
      set: {
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

/** The persistence-internal arg bundle for {@link upsertImageEmbedding} (file-local). */
interface UpsertImageInput {
  readonly id: ImageEmbeddingId;
  readonly assetId: AssetId;
  readonly lens: ImageLens;
  /** The generated caption (image-captioned) or `null` (image-raw). */
  readonly caption: string | null;
  readonly captionMeta: Record<string, unknown> | null;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  readonly now: number;
}

/** Upsert an image vector by `(assetId, model, lens)`. On conflict updates the vector + caption + hash + dim
 *  only — `hub_score`, the key columns, and `created_at` are left as-is. */
export async function upsertImageEmbedding(db: Db, input: UpsertImageInput): Promise<void> {
  await db
    .insert(imageEmbeddings)
    .values({
      id: input.id,
      assetId: input.assetId,
      lens: input.lens,
      caption: input.caption,
      captionMeta: input.captionMeta,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [imageEmbeddings.assetId, imageEmbeddings.model, imageEmbeddings.lens],
      set: {
        embedding: input.embedding,
        caption: input.caption,
        captionMeta: input.captionMeta,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

/** The stored `content_hash` for a chat segment `(chatId, blockIdx, model)`, or `undefined` when no row
 *  exists in that space. `model` is part of the key (PD-104) — the read scopes to the active space so the
 *  staleness short-circuit never compares against a different model's row. */
export async function existingSegmentHash(db: Db, chatId: ChatId, blockIdx: number, model: string): Promise<string | undefined> {
  const rows = await db
    .select({ hash: chatSegments.contentHash })
    .from(chatSegments)
    .where(and(eq(chatSegments.chatId, chatId), eq(chatSegments.blockIdx, blockIdx), eq(chatSegments.model, model)))
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The stored `content_hash` for a chat digest `(chatId, scopedCharacterId, tier, blockIdx, model)`, or
 *  `undefined` when no row exists in that space. The scope key is part of the staleness identity (scope
 *  folds into the hash — §4); `model` is in the key (PD-104) so the read scopes to the active space. */
export async function existingDigestHash(
  db: Db,
  key: {
    chatId: ChatId;
    scopedCharacterId: CharacterId;
    tier: number;
    blockIdx: number;
    model: string;
  },
): Promise<string | undefined> {
  const rows = await db
    .select({ hash: chatDigests.contentHash })
    .from(chatDigests)
    .where(
      and(
        eq(chatDigests.chatId, key.chatId),
        eq(chatDigests.scopedCharacterId, key.scopedCharacterId),
        eq(chatDigests.tier, key.tier),
        eq(chatDigests.blockIdx, key.blockIdx),
        eq(chatDigests.model, key.model),
      ),
    )
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The persistence-internal arg bundle for {@link upsertChatSegment} (file-local — types-in-contract). */
interface UpsertSegmentInput {
  readonly id: ChatSegmentId;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly text: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  readonly now: number;
}

/** Upsert a verbatim segment by `(chatId, blockIdx, model)`. On conflict updates the vector + text +
 *  seq-span + hash + dim only — `hub_score`, the key columns, and `created_at` are left as-is (§invariant
 *  2). `model` is in the conflict key (PD-104): a new space inserts, never overwrites the old one. */
export async function upsertChatSegment(db: Db, input: UpsertSegmentInput): Promise<void> {
  await db
    .insert(chatSegments)
    .values({
      id: input.id,
      chatId: input.chatId,
      blockIdx: input.blockIdx,
      seqStart: input.seqStart,
      seqEnd: input.seqEnd,
      text: input.text,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [chatSegments.chatId, chatSegments.blockIdx, chatSegments.model],
      set: {
        seqStart: input.seqStart,
        seqEnd: input.seqEnd,
        text: input.text,
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

/** The persistence-internal arg bundle for {@link upsertChatDigest} (file-local). */
interface UpsertDigestInput {
  readonly id: ChatDigestId;
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  readonly isGroup: boolean;
  readonly tier: number;
  readonly blockIdx: number;
  readonly text: string;
  readonly topicAnchor: string;
  readonly keywords: readonly string[];
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  readonly now: number;
}

/** Upsert a distilled digest by `(chatId, scopedCharacterId, tier, blockIdx, model)`. Returns the persisted
 *  row's id — on conflict the kept id differs from the freshly-minted `input.id`, so the caller writes the
 *  `chat_digest_speakers` join against this id, never the mint. `model` is in the conflict key (PD-104): a
 *  new space inserts additively rather than overwriting the old space in place. */
export async function upsertChatDigest(db: Db, input: UpsertDigestInput): Promise<ChatDigestId> {
  const rows = await db
    .insert(chatDigests)
    .values({
      id: input.id,
      chatId: input.chatId,
      scopedCharacterId: input.scopedCharacterId,
      isGroup: input.isGroup,
      tier: input.tier,
      blockIdx: input.blockIdx,
      text: input.text,
      topicAnchor: input.topicAnchor,
      keywords: [...input.keywords],
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [chatDigests.chatId, chatDigests.scopedCharacterId, chatDigests.tier, chatDigests.blockIdx, chatDigests.model],
      set: {
        text: input.text,
        topicAnchor: input.topicAnchor,
        keywords: [...input.keywords],
        isGroup: input.isGroup,
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    })
    .returning({ id: chatDigests.id });
  // INSERT-or-UPDATE always affects exactly the one row keyed by (chatId, scopedCharacterId, tier, blockIdx).
  return rows[0]?.id ?? input.id;
}

/** Replace a digest's `chat_digest_speakers` join: delete the existing rows, then insert the new speaker
 *  set. Runs only on the written path — a noop upsert leaves the join intact. */
export async function replaceDigestSpeakers(db: Db, digestId: ChatDigestId, characterIds: readonly CharacterId[]): Promise<void> {
  await db.delete(chatDigestSpeakers).where(eq(chatDigestSpeakers.digestId, digestId));
  if (characterIds.length === 0) {
    return;
  }
  // The composite PK (digest_id, character_id) dedupes a repeated speaker in one block at the DB.
  await db
    .insert(chatDigestSpeakers)
    .values(characterIds.map((characterId) => ({ digestId, characterId })))
    .onConflictDoNothing();
}

/** The stored `content_hash` for a document chunk `(documentId, chunkIdx, model)`, or `undefined` when no row
 *  exists in that space. `model` scopes the read to the active `(model, dim)` space (PD-104 uniformity — the
 *  staleness short-circuit never compares against a different model's row). */
export async function existingChunkHash(db: Db, documentId: DocumentId, chunkIdx: number, model: string): Promise<string | undefined> {
  const rows = await db
    .select({ hash: documentChunks.contentHash })
    .from(documentChunks)
    .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.chunkIdx, chunkIdx), eq(documentChunks.model, model)))
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** Live chunk count per document for the active embed `model` (a GROUP BY over `document_chunks`). Returns
 *  the grouped rows (documents with zero chunks are simply absent); the caller builds its own lookup. The
 *  databank domain consumes this through the injected `countDocumentChunks` op — it never imports the vector
 *  table itself (the vector-scope-derived import chokepoint; databank is not in the sanctioned set). */
export async function countDocumentChunks(db: Db, documentIds: readonly DocumentId[], model: string): Promise<{ documentId: DocumentId; count: number }[]> {
  if (documentIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ documentId: documentChunks.documentId, count: sql<number>`count(*)` })
    .from(documentChunks)
    .where(and(inArray(documentChunks.documentId, [...documentIds]), eq(documentChunks.model, model)))
    .groupBy(documentChunks.documentId);
  return rows;
}

/** The persistence-internal arg bundle for {@link upsertDocumentChunk} (file-local). */
interface UpsertDocumentChunkInput {
  readonly id: DocumentChunkId;
  readonly documentId: DocumentId;
  readonly chunkIdx: number;
  readonly content: string;
  readonly charStart: number;
  readonly charEnd: number;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
  readonly now: number;
}

/** Upsert a document chunk by `(documentId, chunkIdx, model)`. On conflict updates the vector + content +
 *  span + hash + dim only — `hub_score`, the key columns, and `created_at` are left as-is (§invariant 2).
 *  `model` is in the conflict key (PD-104): a new space inserts additively rather than overwriting the old. */
export async function upsertDocumentChunk(db: Db, input: UpsertDocumentChunkInput): Promise<void> {
  await db
    .insert(documentChunks)
    .values({
      id: input.id,
      documentId: input.documentId,
      chunkIdx: input.chunkIdx,
      content: input.content,
      charStart: input.charStart,
      charEnd: input.charEnd,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [documentChunks.documentId, documentChunks.chunkIdx, documentChunks.model],
      set: {
        content: input.content,
        charStart: input.charStart,
        charEnd: input.charEnd,
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

function assertNever(value: never): never {
  throw new Error(`writeHubScoreRows: unhandled vector table ${String(value)}`);
}

/** Batch-UPDATE `hub_score` keyed `(id, model)` on the given table, in one `db.batch` round-trip. Returns
 *  the count of rows actually touched. Exhaustive over {@link VectorTable} — a new table fails tsc until
 *  its arm is added. */
export async function writeHubScoreRows(db: Db, table: VectorTable, updates: readonly HubScoreUpdate[]): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }
  switch (table) {
    case "character_embeddings": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(characterEmbeddings)
            .set({ hubScore: u.hubScore })
            .where(and(eq(characterEmbeddings.id, castId<CharacterEmbeddingId>(u.id)), eq(characterEmbeddings.model, u.model)))
            .returning({ id: characterEmbeddings.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    case "image_embeddings": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(imageEmbeddings)
            .set({ hubScore: u.hubScore })
            .where(and(eq(imageEmbeddings.id, castId<ImageEmbeddingId>(u.id)), eq(imageEmbeddings.model, u.model)))
            .returning({ id: imageEmbeddings.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    case "chat_digests": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(chatDigests)
            .set({ hubScore: u.hubScore })
            .where(and(eq(chatDigests.id, castId<ChatDigestId>(u.id)), eq(chatDigests.model, u.model)))
            .returning({ id: chatDigests.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    case "chat_segments": {
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(chatSegments)
            .set({ hubScore: u.hubScore })
            .where(and(eq(chatSegments.id, castId<ChatSegmentId>(u.id)), eq(chatSegments.model, u.model)))
            .returning({ id: chatSegments.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    case "document_chunks": {
      // v1: discovery has no document-hubness pass, so this arm is unexercised today — it exists so the
      // VectorTable dispatch stays exhaustive (a future discovery document pass writes hub_score the same way).
      const stmts = updates.map((u) =>
        batchStmt(
          db
            .update(documentChunks)
            .set({ hubScore: u.hubScore })
            .where(and(eq(documentChunks.id, castId<DocumentChunkId>(u.id)), eq(documentChunks.model, u.model)))
            .returning({ id: documentChunks.id }),
        ),
      );
      const results = await db.batch(batchMany(stmts));
      return results.reduce((sum, r) => sum + r.length, 0);
    }
    default:
      return assertNever(table);
  }
}
