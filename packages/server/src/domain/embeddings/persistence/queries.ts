// DB access for the store, prune-provenance reads, and hub-score write paths. A vector upsert never writes `hub_score` — it's
// absent from every `.values(...)` and `onConflictDoUpdate.set(...)` here; `hub_score` is written only by
// {@link writeHubScoreRows}. `existing*Hash` reads the stored `content_hash` so the verb can short-circuit a
// no-op before the expensive embed.

import { EMBEDDABLE_ASSET_KINDS } from "@orb/contracts/assets";
import type { HubScoreUpdate, ImageLens, ImageSkipReason, VectorTable } from "@orb/contracts/embeddings";
import type { Db } from "@orb/db";
// `documents` is databank's table, read here (and only here) to derive the OWNER scope of a chunk row — the
// vector tables carry no ownerId (D20: scope derives through the FK to the producer). A cross-domain READ
// from `persistence/`, which is the sanctioned home for exactly that (Tier-1-DB.md §"Cross-tier composition";
// `search/persistence/nearest.ts` joins the same table for the same reason).
import {
  assets,
  characterEmbeddings,
  characters,
  chatDigestSpeakers,
  chatDigests,
  chatSegments,
  chats,
  documentChunks,
  documents,
  embedGenerations,
  imageAnalyses,
  imageEmbeddings,
  imageIndexSkips,
} from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/query";
import { batchMany, batchStmt } from "@orb/db/query";
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
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UnreadableJsonText } from "@orb/kit/json";
import type { SQL } from "drizzle-orm";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";
import type { ExistingCaptionedRow } from "../contract/results.ts";

/** Reclaim derived vectors only; original assets remain available in their owning features. */
export async function purgeDisallowedImageRows(db: Db): Promise<void> {
  await db.delete(imageEmbeddings).where(
    inArray(
      imageEmbeddings.assetId,
      db
        .select({ id: assets.id })
        .from(assets)
        .where(notInArray(assets.kind, [...EMBEDDABLE_ASSET_KINDS])),
    ),
  );
}

const LIMIT_ONE = 1;

// A store pins its generation before it embeds, so its write can land after the owner's target moved on. Each
// upsert's batch takes such a row straight back out: a vector lands only while its generation is still a target,
// and a generation id is minted per owner and task, so that is this owner's target for this task.
// An embed can also outlast the rows the vector hangs from. Each upsert selects from those parents, so a parent deleted
// meanwhile inserts nothing where a VALUES row would fail its foreign key.
function retiredGeneration(generationId: EmbedGenerationId): SQL {
  return sql`not exists (select 1 from embed_generation_targets t where t.generation_id = ${generationId})`;
}

/** Whether a guarded upsert's row survived its batch. A refused late write is the expected end of a race. */
function landed(table: VectorTable, generationId: EmbedGenerationId, refused: readonly unknown[], logger: Logger): boolean {
  if (refused.length === 0) {
    return true;
  }
  getLog(logger).debug({ table, generationId }, "embeddings store: a write for a generation that is no longer the target was refused");
  return false;
}

/** The lens encoded from the asset annotation (the other lens is pure pixels). */
const IMAGE_CAPTION_LENS: ImageLens = "image-captioned";

/** Resolve the funder for a post-ingest prune. This is an un-principaled worker read: databank has already
 * authorized and selected the document before calling the injected embeddings verb. */
// same D20 un-principal seam as domain/databank/persistence/queries.ts::loadDocument — ingest/reindex runs after the enqueue authority check and this read derives the owner needed to pin the generation. Ends if ingest takes a documentId straight off a request.
export async function loadDocumentOwnerForPrune(db: Db, documentId: DocumentId): Promise<UserId | null> {
  const rows = await db.select({ ownerId: documents.ownerId }).from(documents).where(eq(documents.id, documentId)).limit(LIMIT_ONE);
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
    .select({ hash: imageEmbeddings.contentHash, captionMeta: imageAnalyses.captionMeta })
    .from(imageEmbeddings)
    .leftJoin(imageAnalyses, and(eq(imageAnalyses.assetId, imageEmbeddings.assetId), eq(imageAnalyses.contentHash, imageEmbeddings.contentHash)))
    .where(and(eq(imageEmbeddings.assetId, assetId), eq(imageEmbeddings.generationId, generationId), eq(imageEmbeddings.lens, IMAGE_CAPTION_LENS)))
    .limit(LIMIT_ONE);
  const row = rows[0];
  // Provenance-only (`{model}`) is NOT a breakdown — any other key means the analysis ran. Stored text that is not
  // JSON holds no breakdown, so the analysis runs again and replaces it.
  const meta = row?.captionMeta;
  const hasFacets = meta !== null && meta !== undefined && !(meta instanceof UnreadableJsonText) && Object.keys(meta).some((key) => key !== "model");
  return row === undefined ? undefined : { hash: row.hash, hasFacets };
}

/** Is this asset recorded in the admission-floor skip-log? Both admission paths (on-write + bulk sweep) read
 *  this BEFORE loading bytes so a known-degenerate asset is short-circuited without re-loading or re-spending
 *  — the record is HONORED (idempotent skip), not silently re-derived every pass. Model-agnostic: the skip is
 *  keyed by assetId alone (the bytes are immutable per id), so it survives a model change. */
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
 *  is normally reached only once per asset. Selects from the asset like the vector upserts, so an asset deleted
 *  after its bytes were read records nothing. */
export async function insertImageSkip(db: Db, input: InsertImageSkipInput): Promise<void> {
  await db
    .insert(imageIndexSkips)
    .select(
      db
        .select({
          assetId: assets.id,
          reason: sql<ImageSkipReason>`${input.reason}`.as("reason"),
          width: sql<number | null>`${input.width}`.as("width"),
          height: sql<number | null>`${input.height}`.as("height"),
          createdAt: sql<number>`${input.now}`.as("created_at"),
        })
        .from(assets)
        .where(eq(assets.id, input.assetId)),
    )
    .onConflictDoNothing();
}

/** The persistence-internal arg bundle for {@link upsertCharacterEmbedding} (file-local). */
interface UpsertCharacterInput {
  readonly logger: Logger;
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

/** Upsert a card-text vector by `(characterId, generationId)`. On conflict updates `embedding`/`content_hash`/`dim`
 *  only — `hub_score`, `model`, `created_at` are left as-is. Returns `false` when the generation was retired or the
 *  card is gone. */
export async function upsertCharacterEmbedding(db: Db, input: UpsertCharacterInput): Promise<boolean> {
  const upsert = db
    .insert(characterEmbeddings)
    .select(
      db
        .select({
          id: sql<CharacterEmbeddingId>`${input.id}`.as("id"),
          characterId: sql<CharacterId>`${input.characterId}`.as("character_id"),
          embedding: sql<Float32Array>`${sql.param(input.embedding, characterEmbeddings.embedding)}`.as("embedding"),
          contentHash: sql<string>`${input.contentHash}`.as("content_hash"),
          hubScore: sql<number | null>`null`.as("hub_score"),
          model: sql<string>`${input.model}`.as("model"),
          generationId: sql<EmbedGenerationId>`${input.generationId}`.as("generation_id"),
          dim: sql<number>`${input.dim}`.as("dim"),
          createdAt: sql<number>`${input.now}`.as("created_at"),
        })
        .from(characters)
        .innerJoin(embedGenerations, eq(embedGenerations.id, input.generationId))
        .where(eq(characters.id, input.characterId)),
    )
    .onConflictDoUpdate({
      target: [characterEmbeddings.characterId, characterEmbeddings.generationId],
      set: {
        embedding: input.embedding,
        contentHash: input.contentHash,
        dim: input.dim,
      },
    })
    .returning({ id: characterEmbeddings.id });
  const refuse = db
    .delete(characterEmbeddings)
    .where(
      and(
        eq(characterEmbeddings.characterId, input.characterId),
        eq(characterEmbeddings.generationId, input.generationId),
        retiredGeneration(input.generationId),
      ),
    )
    .returning({ id: characterEmbeddings.id });
  const [written, refused] = await db.batch([upsert, refuse]);
  return written.length > 0 && landed("character_embeddings", input.generationId, refused, input.logger);
}

/** The persistence-internal arg bundle for {@link upsertImageEmbedding} (file-local). */
interface UpsertImageInput {
  readonly logger: Logger;
  readonly ownerId: UserId;
  readonly id: ImageEmbeddingId;
  readonly assetId: AssetId;
  readonly lens: ImageLens;
  readonly analysisRevision: number | null;
  readonly embedding: Float32Array;
  readonly contentHash: string;
  readonly model: string;
  readonly generationId: EmbedGenerationId;
  readonly dim: number;
  readonly now: number;
}

/** A vector lands only for the expected asset owner and pinned Utility revision; it never authors the annotation. */
export async function upsertImageEmbedding(db: Db, input: UpsertImageInput): Promise<boolean> {
  const analysisCurrent =
    input.lens === IMAGE_CAPTION_LENS
      ? sql`exists (select 1 from image_analyses a where a.asset_id = ${input.assetId}
       and a.content_hash = ${input.contentHash} and a.revision = ${input.analysisRevision})`
      : sql`true`;
  const upsert = db
    .insert(imageEmbeddings)
    .select(
      db
        .select({
          id: sql<ImageEmbeddingId>`${input.id}`.as("id"),
          assetId: sql<AssetId>`${input.assetId}`.as("asset_id"),
          embedding: sql<Float32Array>`${sql.param(input.embedding, imageEmbeddings.embedding)}`.as("embedding"),
          lens: sql<ImageLens>`${input.lens}`.as("lens"),
          contentHash: sql<string>`${input.contentHash}`.as("content_hash"),
          hubScore: sql<number | null>`null`.as("hub_score"),
          model: sql<string>`${input.model}`.as("model"),
          generationId: sql<EmbedGenerationId>`${input.generationId}`.as("generation_id"),
          dim: sql<number>`${input.dim}`.as("dim"),
          createdAt: sql<number>`${input.now}`.as("created_at"),
        })
        .from(assets)
        .innerJoin(embedGenerations, and(eq(embedGenerations.id, input.generationId), eq(embedGenerations.ownerId, assets.ownerId)))
        .where(
          and(
            eq(assets.id, input.assetId),
            eq(assets.ownerId, input.ownerId),
            input.lens === IMAGE_CAPTION_LENS ? eq(assets.hash, input.contentHash) : undefined,
            analysisCurrent,
          ),
        ),
    )
    .onConflictDoUpdate({
      target: [imageEmbeddings.assetId, imageEmbeddings.generationId, imageEmbeddings.lens],
      set: { embedding: input.embedding, contentHash: input.contentHash, dim: input.dim },
    })
    .returning({ id: imageEmbeddings.id });
  const refuse = db
    .delete(imageEmbeddings)
    .where(
      and(
        eq(imageEmbeddings.assetId, input.assetId),
        eq(imageEmbeddings.generationId, input.generationId),
        eq(imageEmbeddings.lens, input.lens),
        sql`exists (select 1 from assets a where a.id = ${input.assetId} and a.owner_id = ${input.ownerId})`,
        retiredGeneration(input.generationId),
      ),
    )
    .returning({ id: imageEmbeddings.id });
  const [written, refused] = await db.batch([upsert, refuse]);
  return written.length > 0 && landed("image_embeddings", input.generationId, refused, input.logger);
}

/** The stored `content_hash` for a chat segment CHUNK `(chatId, blockIdx, chunkIdx, model)`, or `undefined`
 *  when no row exists in that space. `chunkIdx` is in the key (a block is a row set), which is
 *  also what makes a half-written block self-heal: the chunks that never landed have no row, so they are not
 *  hash-skipped. `model` is part of the key — the read scopes to the active space so the staleness
 *  short-circuit never compares against a different model's row. */
export async function existingSegmentHash(
  db: Db,
  key: Pick<typeof chatSegments.$inferSelect, "chatId" | "blockIdx" | "chunkIdx" | "generationId">,
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
 *  folds into the hash — §4); `model` is in the key so the read scopes to the active space. */
export async function existingDigestHash(
  db: Db,
  key: Pick<typeof chatDigests.$inferSelect, "chatId" | "scopedCharacterId" | "tier" | "blockIdx" | "generationId">,
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
  readonly logger: Logger;
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
 *  (§invariant 2). `model` is in the conflict key: a new space inserts, never overwrites the old
 *  one. `chunkIdx` is in it — a block over the embed window is N rows, never a truncated one.
 *  Returns `false` when the generation was retired or the chat is gone. */
export async function upsertChatSegment(db: Db, input: UpsertSegmentInput): Promise<boolean> {
  const upsert = db
    .insert(chatSegments)
    .select(
      db
        .select({
          id: sql<ChatSegmentId>`${input.id}`.as("id"),
          chatId: sql<ChatId>`${input.chatId}`.as("chat_id"),
          blockIdx: sql<number>`${input.blockIdx}`.as("block_idx"),
          chunkIdx: sql<number>`${input.chunkIdx}`.as("chunk_idx"),
          seqStart: sql<number>`${input.seqStart}`.as("seq_start"),
          seqEnd: sql<number>`${input.seqEnd}`.as("seq_end"),
          text: sql<string>`${input.text}`.as("text"),
          embedding: sql<Float32Array>`${sql.param(input.embedding, chatSegments.embedding)}`.as("embedding"),
          contentHash: sql<string>`${input.contentHash}`.as("content_hash"),
          hubScore: sql<number | null>`null`.as("hub_score"),
          model: sql<string>`${input.model}`.as("model"),
          generationId: sql<EmbedGenerationId>`${input.generationId}`.as("generation_id"),
          dim: sql<number>`${input.dim}`.as("dim"),
          createdAt: sql<number>`${input.now}`.as("created_at"),
        })
        .from(chats)
        .innerJoin(embedGenerations, eq(embedGenerations.id, input.generationId))
        .where(eq(chats.id, input.chatId)),
    )
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
    })
    .returning({ id: chatSegments.id });
  const refuse = db
    .delete(chatSegments)
    .where(
      and(
        eq(chatSegments.chatId, input.chatId),
        eq(chatSegments.blockIdx, input.blockIdx),
        eq(chatSegments.chunkIdx, input.chunkIdx),
        eq(chatSegments.generationId, input.generationId),
        retiredGeneration(input.generationId),
      ),
    )
    .returning({ id: chatSegments.id });
  const [written, refused] = await db.batch([upsert, refuse]);
  return written.length > 0 && landed("chat_segments", input.generationId, refused, input.logger);
}

/** The persistence-internal arg bundle for {@link upsertChatDigest} (file-local). */
interface UpsertDigestInput {
  readonly logger: Logger;
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

/** Upsert a distilled digest by `(chatId, scopedCharacterId, tier, blockIdx, generationId)` and replace its
 *  speaker projection in the SAME batch. The generation is in the conflict key: a new space inserts additively
 *  rather than overwriting the old space in place. Returns `false` when the generation was retired or the chat or the
 *  scoped character is gone. A speaker who is gone drops out of the projection, as the cascade would have dropped it. */
export async function upsertChatDigest(db: Db, input: UpsertDigestInput): Promise<boolean> {
  const key = and(
    eq(chatDigests.chatId, input.chatId),
    eq(chatDigests.scopedCharacterId, input.scopedCharacterId),
    eq(chatDigests.tier, input.tier),
    eq(chatDigests.blockIdx, input.blockIdx),
    eq(chatDigests.generationId, input.generationId),
  );
  const upsert = db
    .insert(chatDigests)
    .select(
      db
        .select({
          id: sql<ChatDigestId>`${input.id}`.as("id"),
          chatId: sql<ChatId>`${input.chatId}`.as("chat_id"),
          scopedCharacterId: sql<CharacterId>`${input.scopedCharacterId}`.as("scoped_character_id"),
          isGroup: sql<boolean>`${sql.param(input.isGroup, chatDigests.isGroup)}`.as("is_group"),
          tier: sql<number>`${input.tier}`.as("tier"),
          blockIdx: sql<number>`${input.blockIdx}`.as("block_idx"),
          text: sql<string>`${input.text}`.as("text"),
          embedding: sql<Float32Array>`${sql.param(input.embedding, chatDigests.embedding)}`.as("embedding"),
          contentHash: sql<string>`${input.contentHash}`.as("content_hash"),
          hubScore: sql<number | null>`null`.as("hub_score"),
          topicAnchor: sql<string>`${input.topicAnchor}`.as("topic_anchor"),
          keywords: sql<string[]>`${sql.param([...input.keywords], chatDigests.keywords)}`.as("keywords"),
          model: sql<string>`${input.model}`.as("model"),
          generationId: sql<EmbedGenerationId>`${input.generationId}`.as("generation_id"),
          dim: sql<number>`${input.dim}`.as("dim"),
          createdAt: sql<number>`${input.now}`.as("created_at"),
        })
        .from(chats)
        .innerJoin(characters, eq(characters.id, input.scopedCharacterId))
        .innerJoin(embedGenerations, eq(embedGenerations.id, input.generationId))
        .where(eq(chats.id, input.chatId)),
    )
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
              .innerJoin(characters, eq(characters.id, characterId))
              .where(key),
          )
          .onConflictDoNothing(),
      ),
    );
  }
  // Its speaker rows cascade with it.
  const refuse = db
    .delete(chatDigests)
    .where(and(key, retiredGeneration(input.generationId)))
    .returning({ id: chatDigests.id });
  statements.push(batchStmt(refuse));
  const results = await db.batch(batchMany(statements));
  const [written] = results;
  const refused = results.at(-1);
  return Array.isArray(written) && written.length > 0 && landed("chat_digests", input.generationId, Array.isArray(refused) ? refused : [], input.logger);
}

/** The stored `content_hash` for a document chunk `(documentId, chunkIdx, model)`, or `undefined` when no row
 *  exists in that space. `model` scopes the read to the active `(model, dim)` space (uniformity — the
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
  readonly logger: Logger;
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
 *  `model` is in the conflict key: a new space inserts additively rather than overwriting the old. Returns
 *  `false` when the generation was retired or the document is gone. */
export async function upsertDocumentChunk(db: Db, input: UpsertDocumentChunkInput): Promise<boolean> {
  const upsert = db
    .insert(documentChunks)
    .select(
      db
        .select({
          id: sql<DocumentChunkId>`${input.id}`.as("id"),
          documentId: sql<DocumentId>`${input.documentId}`.as("document_id"),
          chunkIdx: sql<number>`${input.chunkIdx}`.as("chunk_idx"),
          content: sql<string>`${input.content}`.as("content"),
          charStart: sql<number>`${input.charStart}`.as("char_start"),
          charEnd: sql<number>`${input.charEnd}`.as("char_end"),
          embedding: sql<Float32Array>`${sql.param(input.embedding, documentChunks.embedding)}`.as("embedding"),
          contentHash: sql<string>`${input.contentHash}`.as("content_hash"),
          hubScore: sql<number | null>`null`.as("hub_score"),
          model: sql<string>`${input.model}`.as("model"),
          generationId: sql<EmbedGenerationId>`${input.generationId}`.as("generation_id"),
          dim: sql<number>`${input.dim}`.as("dim"),
          createdAt: sql<number>`${input.now}`.as("created_at"),
        })
        .from(documents)
        .innerJoin(embedGenerations, eq(embedGenerations.id, input.generationId))
        .where(eq(documents.id, input.documentId)),
    )
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
    })
    .returning({ id: documentChunks.id });
  const refuse = db
    .delete(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, input.documentId),
        eq(documentChunks.chunkIdx, input.chunkIdx),
        eq(documentChunks.generationId, input.generationId),
        retiredGeneration(input.generationId),
      ),
    )
    .returning({ id: documentChunks.id });
  const [written, refused] = await db.batch([upsert, refuse]);
  return written.length > 0 && landed("document_chunks", input.generationId, refused, input.logger);
}

function assertNever(value: never): never {
  throw new Error(`writeHubScoreRows: unhandled vector table ${String(value)}`);
}

/** The `(id, model)`-keyed UPDATE for one row. Exhaustive over {@link VectorTable}: a new table fails tsc until
 *  its arm is added. */
function hubScoreStatement(db: Db, table: VectorTable, u: HubScoreUpdate): AwaitableBatchStmt<readonly { readonly id: string }[]> {
  switch (table) {
    case "character_embeddings":
      return batchStmt(
        db
          .update(characterEmbeddings)
          .set({ hubScore: u.hubScore })
          .where(and(eq(characterEmbeddings.id, typeIdSchema(ID_PREFIX.characterEmbedding).parse(u.id)), eq(characterEmbeddings.model, u.model)))
          .returning({ id: characterEmbeddings.id }),
      );
    case "image_embeddings":
      return batchStmt(
        db
          .update(imageEmbeddings)
          .set({ hubScore: u.hubScore })
          .where(and(eq(imageEmbeddings.id, typeIdSchema(ID_PREFIX.imageEmbedding).parse(u.id)), eq(imageEmbeddings.model, u.model)))
          .returning({ id: imageEmbeddings.id }),
      );
    case "chat_digests":
      return batchStmt(
        db
          .update(chatDigests)
          .set({ hubScore: u.hubScore })
          .where(and(eq(chatDigests.id, typeIdSchema(ID_PREFIX.chatDigest).parse(u.id)), eq(chatDigests.model, u.model)))
          .returning({ id: chatDigests.id }),
      );
    case "chat_segments":
      return batchStmt(
        db
          .update(chatSegments)
          .set({ hubScore: u.hubScore })
          .where(and(eq(chatSegments.id, typeIdSchema(ID_PREFIX.chatSegment).parse(u.id)), eq(chatSegments.model, u.model)))
          .returning({ id: chatSegments.id }),
      );
    case "document_chunks":
      // Discovery has no document-hubness pass yet; the arm keeps the dispatch exhaustive.
      return batchStmt(
        db
          .update(documentChunks)
          .set({ hubScore: u.hubScore })
          .where(and(eq(documentChunks.id, typeIdSchema(ID_PREFIX.documentChunk).parse(u.id)), eq(documentChunks.model, u.model)))
          .returning({ id: documentChunks.id }),
      );
    default:
      return assertNever(table);
  }
}

/** Batch-UPDATE `hub_score` keyed `(id, model)` on the given table, in one `db.batch` round-trip. Returns the
 *  count of rows actually touched. The caller bounds `updates` (see `write-hub-scores.ts`). */
export async function writeHubScoreRows(db: Db, table: VectorTable, updates: readonly HubScoreUpdate[]): Promise<number> {
  if (updates.length === 0) {
    return 0;
  }
  const results = await db.batch(batchMany(updates.map((u) => hubScoreStatement(db, table, u))));
  return results.reduce((sum, r) => sum + r.length, 0);
}
