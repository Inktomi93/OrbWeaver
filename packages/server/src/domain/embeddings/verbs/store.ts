// verb: store — THE single vector write path (embeddings.md §"the defining invariant": the ONLY inserter
// into any vector table). One parametrized body collapses the 6 hand-rolled embed+upsert sites neo-tavern
// scattered across 5 tables.
//
// The flow, per lens arm:
//   1. content_hash the content (the staleness gate + cross-chat collapse key).
//   2. read the stored hash for the upsert key — IDENTICAL ⇒ `noop` (no re-embed, no write; the expensive
//      embed is skipped BEFORE it runs).
//   3. embed via the INJECTED role op (`roleClients.embed` for text, `imageEmbed` for images — the model is
//      bound at the root from `connection.resolveRole`; the domain never names a backend/runner/family).
//   4. SPACE TRIPWIRE: the produced vector's dim MUST match the declared `(model, dim)` space, else
//      `SpaceMismatchError` — a mis-tagged row never lands (the store-time half of the space invariant;
//      the compare-time half is `@orb/kit/vector-math`'s dim-mismatch throw).
//   5. upsert the row — `hub_score` is NEVER in the write (the column is `discovery`'s alone; §invariant 2).
//
// The `switch (params.lens)` is the §7.5 exhaustive dispatch (the `assertNever` default arm): a new lens
// fails `tsc` until its embed+upsert arm is added. The `segment` / `digest` chat-block arms (memory's
// verbatim + distilled lenses — domains/memory.md §2) carry a PRECOMPUTED `contentHash` (memory folds the
// seq-span + the stable speaker id + the scope, §1/§4 — the store does NOT recompute it) and embed the
// `text` (the embed input AND the stored body). There is NO `principal`/ownership check — the substrate FKs
// to its producer and never re-checks ownership (D20).
//
// `chat_digest_speakers` (the §4 "which characters this digest CONTAINS" join) IS written here:
// `DigestStoreParams.speakerCharacterIds` carries the set, and `storeDigest` writes the join (via
// `replaceDigestSpeakers`) against the persisted digest id after the upsert. digest speakers updated
// (PD-41). The chat-side `StoreDigestParams` (chat/contract/context) already carries them; the compose root's
// chat→embeddings adapter forwards them into this `DigestStoreParams`.

import { EmbedFailedError, SpaceMismatchError } from "../contract/errors";
import type {
  CardTextStoreParams,
  DigestStoreParams,
  ImageCaptionedStoreParams,
  ImageRawStoreParams,
  SegmentStoreParams,
  StoreParams,
} from "../contract/params";
import type { StoreResult } from "../contract/results";
import type { EmbeddingsContext, EmbeddingsService } from "../contract/service";
import {
  existingCharacterHash,
  existingDigestHash,
  existingImageHash,
  existingSegmentHash,
  replaceDigestSpeakers,
  upsertCharacterEmbedding,
  upsertChatDigest,
  upsertChatSegment,
  upsertImageEmbedding,
} from "../persistence/queries";
import { contentHash } from "../substrate/hash";

function assertNever(value: never): never {
  throw new Error(`embeddings.store: unhandled lens ${String(value)}`);
}

/** The first vector of an embed result, or `EmbedFailedError` when the family filtered the input (`null`) or
 *  returned nothing. */
function firstVector(
  vectors: readonly (Float32Array | null)[],
  lens: string,
  model: string,
): Float32Array {
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
async function storeImage(
  ctx: EmbeddingsContext,
  p: ImageRawStoreParams | ImageCaptionedStoreParams,
): Promise<StoreResult> {
  const hash = contentHash(p.content);
  if (p.force !== true && (await existingImageHash(ctx.db, p.assetId, p.lens, p.model)) === hash) {
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

/** segment → `chat_segments` (the verbatim lens, §2a). `contentHash` is PRECOMPUTED by memory (never
 *  recomputed here); the `text` is both the embed input and the stored body. */
async function storeSegment(ctx: EmbeddingsContext, p: SegmentStoreParams): Promise<StoreResult> {
  const hash = p.contentHash;
  if ((await existingSegmentHash(ctx.db, p.chatId, p.blockIdx)) === hash) {
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

/** digest → `chat_digests` (the distilled lens, §2b). `contentHash` is PRECOMPUTED by memory (folds scope +
 *  speaker + seq-span, §1/§4); the distilled `text` is the embed input, the stored body, AND `{{memory}}`. */
async function storeDigest(ctx: EmbeddingsContext, p: DigestStoreParams): Promise<StoreResult> {
  const hash = p.contentHash;
  const existing = await existingDigestHash(ctx.db, {
    chatId: p.chatId,
    scopedCharacterId: p.scopedCharacterId,
    tier: p.tier,
    blockIdx: p.blockIdx,
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
  // The §4 "which characters this digest CONTAINS" join — written against the PERSISTED id (on conflict the
  // kept id differs from the mint). Only on the written path: a noop upsert left the join intact above.
  await replaceDigestSpeakers(ctx.db, digestId, p.speakerCharacterIds);
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
      default:
        return assertNever(params);
    }
  };
}
