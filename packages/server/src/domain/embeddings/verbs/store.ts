// The single vector write path — the only inserter into any vector table. Per lens arm: hash the content →
// read the stored hash for the upsert key (identical ⇒ noop, skipping the expensive embed) → embed via the
// injected role op → assert the produced vector's dim matches the declared space (else
// `SpaceMismatchError`) → upsert (never touches `hub_score`).
//
// THE STAMPED TAG IS THE PROVIDER'S, NOT THE CALLER'S, and that is a recorded ruling (issue 724,
// `0fed0b3ee`): a request-time snapshot can go stale between parameter construction and the live role call,
// so `EmbedResult.model` is the honest answer for which geometry the vector is actually in. The pin is
// `store.int.test.ts` "stamps the model that actually produced the vector when the live role changed".
//
// WHAT THAT RULING ASSUMES, and what §10-2 had to repair: the caller's `p.model` and the provider's answer
// are the SAME derivation. They were not — the read side spelled the bare model id while every backend
// stamps `embedSpaceOf(model, dtype)` — so the corpus was written into one space and searched in another,
// silently (empty results forever, and `purgeStaleVectors` reclaiming the live rows). That is fixed at the
// DERIVATION (`@orb/contracts/inference` `embedSpaceOf`, the one home both sides now call), not by a
// write-time refusal here: refusing would reverse 724's ruling on exactly the race it was minted for.
//
// The `switch (params.lens)` is exhaustive (the `assertNever` default arm): a new lens fails tsc until its
// arm is added. `digest` carries a precomputed `contentHash` (memory folds it; not recomputed here). There is
// no principal/ownership check — the substrate FKs to its producer only.
//
// The `segment` lens is NOT an arm here: verbatim segments are written in BATCHES (`store-segments.ts`, #172)
// so the corpus sweep can submit one embed flood instead of one awaited embed per block. Same hash gate, same
// space tripwire, same single write path — a batch shape, because its producer holds a batch of work.

import type { EmbedResult, ImageEmbedResult } from "@orb/contracts/providers";
import type { EmbeddingsContext } from "../context.ts";
import { EmbedFailedError, SpaceMismatchError } from "../contract/errors.ts";
import type {
  CardTextStoreParams,
  DigestStoreParams,
  DocumentChunkStoreParams,
  ImageCaptionedStoreParams,
  ImageRawStoreParams,
  StoreParams,
} from "../contract/params.ts";
import type { StoreResult } from "../contract/results.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import {
  existingCaptionedRow,
  existingCharacterHash,
  existingChunkHash,
  existingDigestHash,
  existingImageHash,
  upsertCharacterEmbedding,
  upsertChatDigest,
  upsertDocumentChunk,
  upsertImageEmbedding,
} from "../persistence/queries.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";
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
  const generation = await resolveTargetGeneration(ctx, p.ownerId, "embed");
  if (generation === null) {
    throw new EmbedFailedError(p.lens, p.model);
  }
  const hash = contentHash(p.content);
  if (p.force !== true && (await existingCharacterHash(ctx.db, p.characterId, generation.id)) === hash) {
    return {
      outcome: "noop",
      contentHash: hash,
      model: p.model,
      generationId: generation.id,
      generationEpoch: generation.epoch,
      generationVia: generation.via,
    };
  }
  const embedded = await generation.connection.embed(p.content);
  const vector = firstVector(embedded.vectors, p.lens, embedded.model);
  assertSpace(embedded.model, p.dim, vector);
  await upsertCharacterEmbedding(ctx.db, {
    id: ctx.newCharacterEmbeddingId(),
    characterId: p.characterId,
    embedding: vector,
    contentHash: hash,
    model: embedded.model,
    generationId: generation.id,
    dim: p.dim,
    now: ctx.now(),
  });
  return {
    outcome: "written",
    contentHash: hash,
    model: embedded.model,
    generationId: generation.id,
    generationEpoch: generation.epoch,
    generationVia: generation.via,
  };
}

/** Is the stored row for this lens already current for these bytes? The raw lens is a pure hash question; the
 *  captioned lens additionally requires its facet breakdown (see the call site). */
async function isImageLensCurrent(
  ctx: EmbeddingsContext,
  p: ImageRawStoreParams | ImageCaptionedStoreParams,
  hash: string,
  generationId: string,
): Promise<boolean> {
  if (p.lens === "image-raw") {
    return (await existingImageHash(ctx.db, p.assetId, p.lens, generationId)) === hash;
  }
  const row = await existingCaptionedRow(ctx.db, p.assetId, generationId);
  return row !== undefined && row.hash === hash && row.hasFacets;
}

/** THE JOINT-SPACE DISPATCH (§10-3) — which role op actually produces this image lens's vector.
 *
 *  `image-raw` is pixels, so only an image embedder can serve it; the indexer never asks for it in the
 *  degraded arm. `image-captioned` has two arms: the joint image+caption vector, and — when the owner has
 *  no image-capable embedder — the caption as plain TEXT through the `embed` role, which lands the picture
 *  in their text space instead of dropping it. Both results carry `{vectors, model}`, and the row is
 *  stamped with the PROVIDER's `model` either way (the issue-724 ruling), so the arm never invents a tag. */
/** image-raw / image-captioned → `image_embeddings` (both lenses coexist per `(asset, model, lens)`;
 *  `force` bypasses the staleness short-circuit — PD-53 bulk re-index). */
async function storeImage(ctx: EmbeddingsContext, p: ImageRawStoreParams | ImageCaptionedStoreParams): Promise<StoreResult> {
  const generation = await resolveTargetGeneration(ctx, p.ownerId, "imageEmbed", p.lens === "image-raw" ? "imageEmbed" : p.via);
  if (generation === null) {
    throw new EmbedFailedError(p.lens, p.model);
  }
  const hash = contentHash(p.content);
  // THE CAPTIONED LENS IS CURRENT ONLY WHEN IT ALSO CARRIES ITS FACET BREAKDOWN (issue #164). `content_hash`
  // covers the BYTES, and the bytes did not change when the VL breakdown landed on 2026-08-18 — so a
  // hash-only short-circuit answers `noop` for every pre-existing captioned row and no backfill can ever
  // reach them without `force` (which would pointlessly re-embed the raw lens for the whole box too). The
  // sweep's own pre-check in `verbs/embed-assets` uses the identical two-condition test; keeping the rule in
  // both places would be two homes for one currency definition, so this IS that home and the sweep's
  // pre-check is only an early-out that avoids loading bytes.
  if (p.force !== true && (await isImageLensCurrent(ctx, p, hash, generation.id))) {
    return {
      outcome: "noop",
      contentHash: hash,
      model: p.model,
      generationId: generation.id,
      generationEpoch: generation.epoch,
      generationVia: generation.via,
    };
  }
  // Skip-don't-write on an empty caption (the summarizer returned nothing): content_hash covers bytes only,
  // so a row written with caption:"" would never regenerate without force. Leave it unwritten so the next
  // indexer run retries it — the raw lens already carries the image-only signal.
  if (p.lens === "image-captioned" && p.caption.trim().length === 0) {
    return {
      outcome: "noop",
      contentHash: hash,
      model: p.model,
      generationId: generation.id,
      generationEpoch: generation.epoch,
      generationVia: generation.via,
    };
  }
  // THE JOINT-SPACE DISPATCH (§10-3). The captioned lens has two arms: the joint image+caption vector when
  // the owner HAS an image-capable embedder, and — when they do not — the caption as plain TEXT through the
  // `embed` role, landing the picture in the owner's text space instead of dropping it on the floor. The
  // raw lens has no fallback by construction: nothing but an image embedder can embed pixels, so the
  // indexer never asks for it in the degraded arm.
  let embedded: EmbedResult | ImageEmbedResult;
  if (p.lens === "image-raw") {
    embedded = await generation.connection.imageEmbed({ kind: "image", input: p.content });
  } else if (p.via === "embed") {
    embedded = await generation.connection.embed(p.caption);
  } else {
    embedded = await generation.connection.imageEmbed({ kind: "multimodal", input: { image: p.content, text: p.caption } });
  }
  const vector = firstVector(embedded.vectors, p.lens, embedded.model);
  assertSpace(embedded.model, p.dim, vector);
  await upsertImageEmbedding(ctx.db, {
    id: ctx.newImageEmbeddingId(),
    assetId: p.assetId,
    lens: p.lens,
    caption: p.lens === "image-captioned" ? p.caption : null,
    captionMeta: p.lens === "image-captioned" ? (p.captionMeta ?? null) : null,
    embedding: vector,
    contentHash: hash,
    model: embedded.model,
    generationId: generation.id,
    dim: p.dim,
    now: ctx.now(),
  });
  return {
    outcome: "written",
    contentHash: hash,
    model: embedded.model,
    generationId: generation.id,
    generationEpoch: generation.epoch,
    generationVia: generation.via,
  };
}

/** digest → `chat_digests` (the distilled lens). `contentHash` is precomputed by memory; the distilled
 *  `text` is the embed input, the stored body, and `{{memory}}`. */
async function storeDigest(ctx: EmbeddingsContext, p: DigestStoreParams): Promise<StoreResult> {
  const generation = await resolveTargetGeneration(ctx, p.ownerId, "embed");
  if (generation === null) {
    throw new EmbedFailedError(p.lens, p.model);
  }
  const hash = p.contentHash;
  const existing = await existingDigestHash(ctx.db, {
    chatId: p.chatId,
    scopedCharacterId: p.scopedCharacterId,
    tier: p.tier,
    blockIdx: p.blockIdx,
    generationId: generation.id,
  });
  if (existing === hash) {
    return {
      outcome: "noop",
      contentHash: hash,
      model: p.model,
      generationId: generation.id,
      generationEpoch: generation.epoch,
      generationVia: generation.via,
    };
  }
  const embedded = await generation.connection.embed(p.text);
  const vector = firstVector(embedded.vectors, p.lens, embedded.model);
  assertSpace(embedded.model, p.dim, vector);
  await upsertChatDigest(ctx.db, {
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
    model: embedded.model,
    generationId: generation.id,
    dim: p.dim,
    now: ctx.now(),
    speakerCharacterIds: p.speakerCharacterIds,
  });
  // The persistence seam commits the digest and its complete speaker projection as one atomic batch.
  return {
    outcome: "written",
    contentHash: hash,
    model: embedded.model,
    generationId: generation.id,
    generationEpoch: generation.epoch,
    generationVia: generation.via,
  };
}

/** chunk → `document_chunks` (the databank RAG lens). Hash-gated on `(documentId, chunkIdx, model)`; `content`
 *  (the kit/chunk slice, incl. any overlap prefix) is the embed input. No `hub_score` write (D20/discovery-
 *  only); the FK to `documents` is the only ownership link. */
async function storeChunk(ctx: EmbeddingsContext, p: DocumentChunkStoreParams): Promise<StoreResult> {
  const generation = await resolveTargetGeneration(ctx, p.ownerId, "embed");
  if (generation === null) {
    throw new EmbedFailedError(p.lens, p.model);
  }
  const hash = contentHash(p.content);
  if ((await existingChunkHash(ctx.db, p.fkRefs.documentId, p.fkRefs.chunkIdx, generation.id)) === hash) {
    return {
      outcome: "noop",
      contentHash: hash,
      model: p.model,
      generationId: generation.id,
      generationEpoch: generation.epoch,
      generationVia: generation.via,
    };
  }
  const embedded = await generation.connection.embed(p.content);
  const vector = firstVector(embedded.vectors, p.lens, embedded.model);
  assertSpace(embedded.model, p.dim, vector);
  await upsertDocumentChunk(ctx.db, {
    id: ctx.newDocumentChunkId(),
    documentId: p.fkRefs.documentId,
    chunkIdx: p.fkRefs.chunkIdx,
    content: p.content,
    charStart: p.fkRefs.charStart,
    charEnd: p.fkRefs.charEnd,
    embedding: vector,
    contentHash: hash,
    model: embedded.model,
    generationId: generation.id,
    dim: p.dim,
    now: ctx.now(),
  });
  return {
    outcome: "written",
    contentHash: hash,
    model: embedded.model,
    generationId: generation.id,
    generationEpoch: generation.epoch,
    generationVia: generation.via,
  };
}

export function createStore(ctx: EmbeddingsContext): EmbeddingsService["store"] {
  return (params: StoreParams): Promise<StoreResult> => {
    switch (params.lens) {
      case "card-text":
        return storeCardText(ctx, params);
      case "image-raw":
      case "image-captioned":
        return storeImage(ctx, params);
      case "digest":
        return storeDigest(ctx, params);
      case "chunk":
        return storeChunk(ctx, params);
      default:
        return assertNever(params);
    }
  };
}
