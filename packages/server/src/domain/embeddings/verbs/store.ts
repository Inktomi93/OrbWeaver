// The single vector write path — the only inserter into any vector table. Per lens arm: hash the content →
// read the stored hash for the upsert key (identical ⇒ noop, skipping the expensive embed) → embed via the
// injected role op → assert the produced vector's dim matches the declared space (else
// `SpaceMismatchError`) → upsert (never touches `hub_score`).
//
// The `switch (params.lens)` is exhaustive (the `assertNever` default arm): a new lens fails tsc until its
// arm is added. `segment`/`digest` carry a precomputed `contentHash` (memory folds it; not recomputed
// here). There is no principal/ownership check — the substrate FKs to its producer only.

import type { EmbeddingsContext } from "../context.ts";
import { EmbedFailedError, SpaceMismatchError } from "../contract/errors.ts";
import type {
  CardTextStoreParams,
  DigestStoreParams,
  DocumentChunkStoreParams,
  ImageCaptionedStoreParams,
  ImageRawStoreParams,
  SegmentStoreParams,
  StoreParams,
} from "../contract/params.ts";
import type { StoreResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import {
  existingCharacterHash,
  existingChunkHash,
  existingDigestHash,
  existingImageHash,
  existingSegmentHash,
  replaceDigestSpeakers,
  upsertCharacterEmbedding,
  upsertChatDigest,
  upsertChatSegment,
  upsertDocumentChunk,
  upsertImageEmbedding,
} from "../persistence/queries.ts";
import { contentHash } from "../substrate/hash.ts";

function assertNever(value: never): never {
  throw new Error(`embeddings.store: unhandled lens ${String(value)}`);
}

/** The first vector of an embed result, or `EmbedFailedError` when the family filtered the input (`null`) or
 *  returned nothing. */
function firstVector(vectors: readonly (Float32Array | null)[], lens: string, model: string): Float32Array {
  const vector = vectors[0];
  if (vector === null || vector === undefined) {
    throw new EmbedFailedError(lens, model);
  }
  return vector;
}

/** The store-time space tripwire: the produced vector must match the declared space `dim`. */
function assertSpace(model: string, dim: number, vector: Float32Array): void {
  if (vector.length !== dim) {
    throw new SpaceMismatchError(model, dim, vector.length);
  }
}

/** card-text → `character_embeddings` (hash-gated; the staleness gate short-circuits before the embed —
 *  unless `force`, the PD-53 bulk re-index escape hatch that bypasses ONLY the short-circuit). */
async function storeCardText(ctx: EmbeddingsContext, p: CardTextStoreParams): Promise<StoreResult> {
  const hash = contentHash(p.content);
  if (p.force !== true && (await existingCharacterHash(ctx.db, p.characterId, p.model)) === hash) {
    return { outcome: "noop", contentHash: hash };
  }
  const vector = firstVector((await ctx.roleClients.embed(p.content)).vectors, p.lens, p.model);
  assertSpace(p.model, p.dim, vector);
  await upsertCharacterEmbedding(ctx.db, {
    id: ctx.newCharacterEmbeddingId(),
    characterId: p.characterId,
    embedding: vector,
    contentHash: hash,
    model: p.model,
    dim: p.dim,
    now: ctx.now(),
  });
  return { outcome: "written", contentHash: hash };
}

/** image-raw / image-captioned → `image_embeddings` (both lenses coexist per `(asset, model, lens)`;
 *  `force` bypasses the staleness short-circuit — PD-53 bulk re-index). */
async function storeImage(ctx: EmbeddingsContext, p: ImageRawStoreParams | ImageCaptionedStoreParams): Promise<StoreResult> {
  const hash = contentHash(p.content);
  if (p.force !== true && (await existingImageHash(ctx.db, p.assetId, p.lens, p.model)) === hash) {
    return { outcome: "noop", contentHash: hash };
  }
  // Skip-don't-write on an empty caption (the summarizer returned nothing): content_hash covers bytes only,
  // so a row written with caption:"" would never regenerate without force. Leave it unwritten so the next
  // indexer run retries it — the raw lens already carries the image-only signal.
  if (p.lens === "image-captioned" && p.caption.trim().length === 0) {
    return { outcome: "noop", contentHash: hash };
  }
  const req =
    p.lens === "image-captioned"
      ? ({ kind: "multimodal", input: { image: p.content, text: p.caption } } as const)
      : ({ kind: "image", input: p.content } as const);
  const vector = firstVector((await ctx.roleClients.imageEmbed(req)).vectors, p.lens, p.model);
  assertSpace(p.model, p.dim, vector);
  await upsertImageEmbedding(ctx.db, {
    id: ctx.newImageEmbeddingId(),
    assetId: p.assetId,
    lens: p.lens,
    caption: p.lens === "image-captioned" ? p.caption : null,
    captionMeta: p.lens === "image-captioned" ? (p.captionMeta ?? null) : null,
    embedding: vector,
    contentHash: hash,
    model: p.model,
    dim: p.dim,
    now: ctx.now(),
  });
  return { outcome: "written", contentHash: hash };
}

/** segment → `chat_segments` (the verbatim lens). `contentHash` is precomputed by memory; `text` is both
 *  the embed input and the stored body. */
async function storeSegment(ctx: EmbeddingsContext, p: SegmentStoreParams): Promise<StoreResult> {
  const hash = p.contentHash;
  if ((await existingSegmentHash(ctx.db, p.chatId, p.blockIdx, p.model)) === hash) {
    return { outcome: "noop", contentHash: hash };
  }
  const vector = firstVector((await ctx.roleClients.embed(p.text)).vectors, p.lens, p.model);
  assertSpace(p.model, p.dim, vector);
  await upsertChatSegment(ctx.db, {
    id: ctx.newChatSegmentId(),
    chatId: p.chatId,
    blockIdx: p.blockIdx,
    seqStart: p.seqStart,
    seqEnd: p.seqEnd,
    text: p.text,
    embedding: vector,
    contentHash: hash,
    model: p.model,
    dim: p.dim,
    now: ctx.now(),
  });
  return { outcome: "written", contentHash: hash };
}

/** digest → `chat_digests` (the distilled lens). `contentHash` is precomputed by memory; the distilled
 *  `text` is the embed input, the stored body, and `{{memory}}`. */
async function storeDigest(ctx: EmbeddingsContext, p: DigestStoreParams): Promise<StoreResult> {
  const hash = p.contentHash;
  const existing = await existingDigestHash(ctx.db, {
    chatId: p.chatId,
    scopedCharacterId: p.scopedCharacterId,
    tier: p.tier,
    blockIdx: p.blockIdx,
    model: p.model,
  });
  if (existing === hash) {
    return { outcome: "noop", contentHash: hash };
  }
  const vector = firstVector((await ctx.roleClients.embed(p.text)).vectors, p.lens, p.model);
  assertSpace(p.model, p.dim, vector);
  const digestId = await upsertChatDigest(ctx.db, {
    id: ctx.newChatDigestId(),
    chatId: p.chatId,
    scopedCharacterId: p.scopedCharacterId,
    isGroup: p.isGroup,
    tier: p.tier,
    blockIdx: p.blockIdx,
    text: p.text,
    topicAnchor: p.topicAnchor,
    keywords: p.keywords,
    embedding: vector,
    contentHash: hash,
    model: p.model,
    dim: p.dim,
    now: ctx.now(),
  });
  // The "which characters this digest contains" join, written against the persisted id (on conflict the
  // kept id differs from the mint). Only on the written path.
  await replaceDigestSpeakers(ctx.db, digestId, p.speakerCharacterIds);
  return { outcome: "written", contentHash: hash };
}

/** chunk → `document_chunks` (the databank RAG lens). Hash-gated on `(documentId, chunkIdx, model)`; `content`
 *  (the kit/chunk slice, incl. any overlap prefix) is the embed input. No `hub_score` write (D20/discovery-
 *  only); the FK to `documents` is the only ownership link. */
async function storeChunk(ctx: EmbeddingsContext, p: DocumentChunkStoreParams): Promise<StoreResult> {
  const hash = contentHash(p.content);
  if ((await existingChunkHash(ctx.db, p.fkRefs.documentId, p.fkRefs.chunkIdx, p.model)) === hash) {
    return { outcome: "noop", contentHash: hash };
  }
  const vector = firstVector((await ctx.roleClients.embed(p.content)).vectors, p.lens, p.model);
  assertSpace(p.model, p.dim, vector);
  await upsertDocumentChunk(ctx.db, {
    id: ctx.newDocumentChunkId(),
    documentId: p.fkRefs.documentId,
    chunkIdx: p.fkRefs.chunkIdx,
    content: p.content,
    charStart: p.fkRefs.charStart,
    charEnd: p.fkRefs.charEnd,
    embedding: vector,
    contentHash: hash,
    model: p.model,
    dim: p.dim,
    now: ctx.now(),
  });
  return { outcome: "written", contentHash: hash };
}

export function createStore(ctx: EmbeddingsContext): EmbeddingsService["store"] {
  return (params: StoreParams): Promise<StoreResult> => {
    switch (params.lens) {
      case "card-text":
        return storeCardText(ctx, params);
      case "image-raw":
      case "image-captioned":
        return storeImage(ctx, params);
      case "segment":
        return storeSegment(ctx, params);
      case "digest":
        return storeDigest(ctx, params);
      case "chunk":
        return storeChunk(ctx, params);
      default:
        return assertNever(params);
    }
  };
}
