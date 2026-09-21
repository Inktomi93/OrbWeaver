// DB access for the store, prune-provenance reads, and hub-score write paths. A vector upsert never writes `hub_score` — it's
// absent from every `.values(...)` and `onConflictDoUpdate.set(...)` here; `hub_score` is written only by
// {@link writeHubScoreRows}. `existing*Hash` reads the stored `content_hash` so the verb can short-circuit a
// no-op before the expensive embed.

import type { ImageCaptionMeta, ImageLens, ImageSkipReason } from "@orb/contracts/embeddings";
import { imageCaptionMetaSchema } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
// `documents` is databank's table, read here (and only here) to derive the OWNER scope of a chunk row — the
// vector tables carry no ownerId (D20: scope derives through the FK to the producer). A cross-domain READ
// from `persistence/`, which is the sanctioned home for exactly that (own-tables-only scopes `persistence/`
// out; `search/persistence/nearest.ts` joins the same table for the same reason).
import {
  characterEmbeddings,
  chatDigestSpeakers,
  chatDigests,
  chatParticipants,
  chatSegments,
  documentChunks,
  documents,
  imageEmbeddings,
  imageIndexSkips,
} from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
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
  EmbedGenerationId,
  ImageEmbeddingId,
  UserId,
} from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { HubScoreUpdate, VectorTable } from "../contract/params.ts";
import type { ExistingCaptionedRow } from "../contract/results.ts";

const LIMIT_ONE = 1;

/** The lens whose row carries the caption + its facet breakdown (the other lens is pure pixels). */
const IMAGE_CAPTION_LENS: ImageLens = "image-captioned";

/** Resolve the funder for a post-ingest prune. This is an un-principaled worker read: databank has already
 * authorized and selected the document before calling the injected embeddings verb. */
// @orb-waive owner-scoped-reads(documents): same D20 un-principal seam as domain/databank/persistence/queries.ts::loadDocument — ingest/reindex runs after the enqueue authority check and this read derives the owner needed to pin the generation. Ends if ingest takes a documentId straight off a request.
export async function loadDocumentOwnerForPrune(db: Db, documentId: DocumentId): Promise<UserId | null> {
  const rows = await db.select({ ownerId: documents.ownerId }).from(documents).where(eq(documents.id, documentId)).limit(LIMIT_ONE);
  return rows[0]?.ownerId ?? null;
}

/** Resolve the present host who funds a post-build memory prune. The memory builder has already selected
 * the chat through its authorized workload path; this persistence read pins the corresponding generation. */
export async function loadChatHostOwnerForPrune(db: Db, chatId: ChatId): Promise<UserId | null> {
  const rows = await db
    .select({ ownerId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  return rows[0]?.ownerId ?? null;
}

/** The stored `content_hash` for `(characterId, model)`, or `undefined` when no row exists yet. */
export async function existingCharacterHash(db: Db, characterId: CharacterId, generationId: EmbedGenerationId): Promise<string | undefined> {
  const rows = await db
    .select({ hash: characterEmbeddings.contentHash })
    .from(characterEmbeddings)
    .where(and(eq(characterEmbeddings.characterId, characterId), eq(characterEmbeddings.generationId, generationId)))
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The stored `content_hash` for `(assetId, model, lens)`, or `undefined` when no row exists yet. */
export async function existingImageHash(db: Db, assetId: AssetId, lens: ImageLens, generationId: EmbedGenerationId): Promise<string | undefined> {
  const rows = await db
    .select({ hash: imageEmbeddings.contentHash })
    .from(imageEmbeddings)
    .where(and(eq(imageEmbeddings.assetId, assetId), eq(imageEmbeddings.generationId, generationId), eq(imageEmbeddings.lens, lens)))
    .limit(LIMIT_ONE);
  return rows[0]?.hash;
}

/** The captioned-lens row for `(assetId, model)` — hash + facet presence — or `undefined` when none exists. */
export async function existingCaptionedRow(db: Db, assetId: AssetId, generationId: EmbedGenerationId): Promise<ExistingCaptionedRow | undefined> {
  const rows = await db
    .select({ hash: imageEmbeddings.contentHash, captionMeta: imageEmbeddings.captionMeta })
    .from(imageEmbeddings)
    .where(and(eq(imageEmbeddings.assetId, assetId), eq(imageEmbeddings.generationId, generationId), eq(imageEmbeddings.lens, IMAGE_CAPTION_LENS)))
    .limit(LIMIT_ONE);
  const row = rows[0];
  // Provenance-only (`{model}`) is NOT a breakdown — any other key means the analysis ran.
  return row === undefined ? undefined : { hash: row.hash, hasFacets: row.captionMeta !== null && Object.keys(row.captionMeta).some((key) => key !== "model") };
}

/** Is this asset recorded in the admission-floor skip-log? Both admission paths (on-write + bulk sweep) read
 *  this BEFORE loading bytes so a known-degenerate asset is short-circuited without re-loading or re-spending
 *  — the record is HONORED (idempotent skip), not silently re-derived every pass. Model-agnostic: the skip is
 *  keyed by assetId alone (the bytes are immutable per id), so it survives a PD-104 model change. */
export async function existingImageSkip(db: Db, assetId: AssetId): Promise<boolean> {
  const rows = await db.select({ assetId: imageIndexSkips.assetId }).from(imageIndexSkips).where(eq(imageIndexSkips.assetId, assetId)).limit(LIMIT_ONE);
  return rows.length > 0;
}

/** The persistence-internal arg bundle for {@link insertImageSkip} (file-local). */
interface InsertImageSkipInput {
  readonly assetId: AssetId;
  readonly reason: ImageSkipReason;
  /** The header-parsed dimensions that tripped the floor (attribution only). */
  readonly width: number | null;
  readonly height: number | null;
  /** Epoch-ms from the injected clock — the record's `created_at`. */
  readonly now: number;
}

/** Record an admission-floor skip. `onConflictDoNothing` on the asset PK: the first verdict stands (a
 *  duplicate bus delivery or a concurrent write is an idempotent no-op) — the read short-circuit means this
 *  is normally reached only once per asset. */
export async function insertImageSkip(db: Db, input: InsertImageSkipInput): Promise<void> {
  await db
    .insert(imageIndexSkips)
    .values({ assetId: input.assetId, reason: input.reason, width: input.width, height: input.height, createdAt: input.now })
    .onConflictDoNothing();
}

/** The persistence-internal arg bundle for {@link upsertCharacterEmbedding} (file-local). */
interface UpsertCharacterInput {
  readonly id: CharacterEmbeddingId;
  readonly characterId: CharacterId;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly generationId: EmbedGenerationId;
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
      generationId: input.generationId,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [characterEmbeddings.characterId, characterEmbeddings.generationId],
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
  /** The VL breakdown + provenance blob, in its ONE contract shape (issue #164 — an open bag here is
   *  exactly what let the reader and the writer disagree in silence). */
  readonly captionMeta: ImageCaptionMeta | null;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly generationId: EmbedGenerationId;
  readonly dim: number;
  readonly now: number;
}

/** Upsert an image vector by `(assetId, model, lens)`. Non-null caption metadata is parsed once before either
 *  insert or update. On conflict updates the vector + caption + hash + dim only — `hub_score`, the key
 *  columns, and `created_at` are left as-is. */
export async function upsertImageEmbedding(db: Db, input: UpsertImageInput): Promise<void> {
  const captionMeta = input.captionMeta === null ? null : imageCaptionMetaSchema.parse(input.captionMeta);
  await db
    .insert(imageEmbeddings)
    .values({
      id: input.id,
      assetId: input.assetId,
      lens: input.lens,
      caption: input.caption,
      captionMeta,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      generationId: input.generationId,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [imageEmbeddings.assetId, imageEmbeddings.generationId, imageEmbeddings.lens],
      set: {
        embedding: input.embedding,
        caption: input.caption,
        captionMeta,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    });
}

/** The stored `content_hash` for a chat segment CHUNK `(chatId, blockIdx, chunkIdx, model)`, or `undefined`
 *  when no row exists in that space. `chunkIdx` joined the key with #172 (a block is a row set now), which is
 *  also what makes a half-written block self-heal: the chunks that never landed have no row, so they are not
 *  hash-skipped. `model` is part of the key (PD-104) — the read scopes to the active space so the staleness
 *  short-circuit never compares against a different model's row. */
export async function existingSegmentHash(
  db: Db,
  key: { chatId: ChatId; blockIdx: number; chunkIdx: number; generationId: EmbedGenerationId },
): Promise<string | undefined> {
  const rows = await db
    .select({ hash: chatSegments.contentHash })
    .from(chatSegments)
    .where(
      and(
        eq(chatSegments.chatId, key.chatId),
        eq(chatSegments.blockIdx, key.blockIdx),
        eq(chatSegments.chunkIdx, key.chunkIdx),
        eq(chatSegments.generationId, key.generationId),
      ),
    )
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
    generationId: EmbedGenerationId;
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
        eq(chatDigests.generationId, key.generationId),
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
  readonly chunkIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  readonly text: string;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly generationId: EmbedGenerationId;
  readonly dim: number;
  readonly now: number;
}

/** Upsert a verbatim segment CHUNK by `(chatId, blockIdx, chunkIdx, model)`. On conflict updates the vector +
 *  text + seq-span + hash + dim only — `hub_score`, the key columns, and `created_at` are left as-is
 *  (§invariant 2). `model` is in the conflict key (PD-104): a new space inserts, never overwrites the old
 *  one. `chunkIdx` joined it with #172 — a block over the embed window is N rows, never a truncated one. */
export async function upsertChatSegment(db: Db, input: UpsertSegmentInput): Promise<void> {
  await db
    .insert(chatSegments)
    .values({
      id: input.id,
      chatId: input.chatId,
      blockIdx: input.blockIdx,
      chunkIdx: input.chunkIdx,
      seqStart: input.seqStart,
      seqEnd: input.seqEnd,
      text: input.text,
      embedding: input.embedding,
      contentHash: input.contentHash,
      model: input.model,
      generationId: input.generationId,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [chatSegments.chatId, chatSegments.blockIdx, chatSegments.chunkIdx, chatSegments.generationId],
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
  readonly generationId: EmbedGenerationId;
  readonly dim: number;
  readonly now: number;
  /** The complete speaker projection for this digest. Replaced in the same atomic batch as the digest. */
  readonly speakerCharacterIds: readonly CharacterId[];
}

/** Upsert a distilled digest by `(chatId, scopedCharacterId, tier, blockIdx, model)` and replace its speaker
 *  projection in the SAME batch. Returns the persisted row's id — on conflict the kept id differs from the
 *  freshly-minted `input.id`. `model` is in the conflict key (PD-104): a new space inserts additively rather
 *  than overwriting the old space in place. */
export async function upsertChatDigest(db: Db, input: UpsertDigestInput): Promise<ChatDigestId> {
  const key = and(
    eq(chatDigests.chatId, input.chatId),
    eq(chatDigests.scopedCharacterId, input.scopedCharacterId),
    eq(chatDigests.tier, input.tier),
    eq(chatDigests.blockIdx, input.blockIdx),
    eq(chatDigests.generationId, input.generationId),
  );
  const upsert = db
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
      generationId: input.generationId,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [chatDigests.chatId, chatDigests.scopedCharacterId, chatDigests.tier, chatDigests.blockIdx, chatDigests.generationId],
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
  const digestId = db.select({ id: chatDigests.id }).from(chatDigests).where(key).limit(LIMIT_ONE);
  const statements: BatchStmt[] = [batchStmt(upsert), batchStmt(db.delete(chatDigestSpeakers).where(inArray(chatDigestSpeakers.digestId, digestId)))];
  for (const characterId of input.speakerCharacterIds) {
    statements.push(
      batchStmt(
        db
          .insert(chatDigestSpeakers)
          .select(
            db
              .select({ digestId: chatDigests.id, characterId: sql<CharacterId>`${characterId}`.as("character_id") })
              .from(chatDigests)
              .where(key),
          )
          .onConflictDoNothing(),
      ),
    );
  }
  await db.batch(batchMany(statements));
  const rows = await digestId;
  // INSERT-or-UPDATE always affects exactly the one row keyed by (chatId, scopedCharacterId, tier, blockIdx).
  return rows[0]?.id ?? input.id;
}

/** The stored `content_hash` for a document chunk `(documentId, chunkIdx, model)`, or `undefined` when no row
 *  exists in that space. `model` scopes the read to the active `(model, dim)` space (PD-104 uniformity — the
 *  staleness short-circuit never compares against a different model's row). */
export async function existingChunkHash(db: Db, documentId: DocumentId, chunkIdx: number, generationId: EmbedGenerationId): Promise<string | undefined> {
  const rows = await db
    .select({ hash: documentChunks.contentHash })
    .from(documentChunks)
    .where(and(eq(documentChunks.documentId, documentId), eq(documentChunks.chunkIdx, chunkIdx), eq(documentChunks.generationId, generationId)))
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

/** Live chunk count per document for an OWNER's whole bank — {@link countDocumentChunks} scoped by owner
 *  instead of by id list. Scoped through a join to `documents` because `document_chunks` carries no ownerId:
 *  scope derives through the FK to the producer (D20). That join is a cross-domain READ from `persistence/`,
 *  which is its sanctioned home (`search/persistence/nearest.ts` joins the same table for the same reason).
 *
 *  Its two consumers are databank's library PHASE lens (which needs only "is this document chunked at all",
 *  the map's key set) and the bank-health census (which needs the counts). databank reaches both through the
 *  injected `chunkCountsByOwner` op — it never imports the vector table (the vector-scope-derived chokepoint;
 *  databank is deliberately not in the sanctioned set). Documents with zero chunks are simply absent. */
export async function countDocumentChunksByOwner(db: Db, ownerId: UserId, model: string): Promise<{ documentId: DocumentId; count: number }[]> {
  const rows = await db
    .select({ documentId: documentChunks.documentId, count: sql<number>`count(*)` })
    .from(documentChunks)
    .innerJoin(documents, eq(documentChunks.documentId, documents.id))
    .where(and(eq(documents.ownerId, ownerId), eq(documentChunks.model, model)))
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
  readonly generationId: EmbedGenerationId;
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
      generationId: input.generationId,
      dim: input.dim,
      createdAt: input.now,
    })
    .onConflictDoUpdate({
      target: [documentChunks.documentId, documentChunks.chunkIdx, documentChunks.generationId],
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
