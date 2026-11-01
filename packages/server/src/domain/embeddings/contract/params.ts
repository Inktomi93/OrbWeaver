// The verb input shapes and vector-table registry for the embeddings write surface.

import type { CardTextStoreInput, DocumentChunkStoreInput, EmbeddingTask } from "@orb/contracts/embeddings";

import type { AssetId, CharacterId, ChatId, UserId } from "@orb/kit/ids";

// Store params: a discriminated union on `lens`. `ownerId` is the entity OWNER — the FUNDER whose embed
// connection produces the vector and whose binding defines the space (inference program §7.5-2, a vector task
// is `scope: "owner"`). Vector rows still FK to their producer only; owner-scope at search time derives from
// the producer, never from a column here.

/** The sweep's abort, carried to the embed call. A pass checks it between items AND the embed call stops
 *  waiting on the model when it fires, so an aborted pass settles while a model is still loading. An embed cut
 *  off this way rejects before the row write, so it leaves no partial row. */
interface EmbedAbortParams {
  readonly signal?: AbortSignal | undefined;
}

/** Embed a character card's text. Unique key: `(characterId, model)`. */
export interface CardTextStoreParams extends CardTextStoreInput, EmbedAbortParams {}

/** Embed an avatar image's pure visual signal (no caption influence). Unique key: `(assetId, model, lens)`. */
export interface ImageRawStoreParams extends EmbedAbortParams {
  readonly lens: "image-raw";
  readonly ownerId: UserId;
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  readonly model: string;
  /** Re-embed even on a matched `content_hash`. */
  readonly force?: boolean | undefined;
}

/** Embed an avatar image jointly with its generated caption (image bytes + caption → one VL vector). The
 *  accepted Utility revision pins its input. Unique key: `(assetId, model, lens)`. */
export interface ImageCaptionedStoreParams extends EmbedAbortParams {
  readonly lens: "image-captioned";
  readonly ownerId: UserId;
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  /** The caption from the pinned Utility annotation, used as encoder input. */
  readonly caption: string;
  /** The accepted Utility annotation revision this encoder input was read from. */
  readonly analysisRevision: number;
  /** THE JOINT-SPACE ARM (§10-3). `imageEmbed` = the joint image+caption vector through the owner's image
   *  embedder. `embed` = the CAPTIONED-TEXT fallback: the owner has no image-capable embedder, so the
   *  caption alone is embedded as TEXT into their `embed` space. The store verb dispatches the role op off
   *  this — it is not derivable from `model`, which is just a tag, and guessing it wrong writes a vector
   *  into a geometry nothing queries. */
  readonly via: EmbeddingTask;
  readonly model: string;
  /** Re-embed even on a matched `content_hash`. */
  readonly force?: boolean | undefined;
}

/** Embed ONE in-budget chunk of an aged-out chat block's verbatim transcript. `text` is the embed input AND
 *  the stored `chat_segments.text`. `contentHash` is precomputed by memory (not recomputed here). Unique key:
 *  `(chatId, blockIdx, chunkIdx, model)`.
 *
 *  Segments are written through {@link EmbeddingsService.storeSegments} (a BATCH), never through the single
 *  `store` — a block over the embed window becomes N chunks (#172), and the corpus sweep submits every chat's
 *  chunks as ONE embed flood (owner batching ruling: batch by phase, let vLLM's scheduler own concurrency). */
export interface SegmentStoreParams {
  readonly lens: "segment";
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly blockIdx: number;
  /** Position within the block (0 when one chunk covers it whole — the overwhelming majority). */
  readonly chunkIdx: number;
  /** The HONEST span of messages this chunk's text contains (see `db/schema/embeddings.ts` chat_segments). */
  readonly seqStart: number;
  readonly seqEnd: number;
  /** The verbatim chunk transcript — embedded AND persisted (`chat_segments.text`). */
  readonly text: string;
  /** Staleness/collapse key, precomputed by memory (per CHUNK — it folds the chunk's position + count). */
  readonly contentHash: string;
  readonly model: string;
}

/** Embed an aged-out chat block's distilled digest. `text` is the distilled body — the embed input, the
 *  stored `chat_digests.text`, and what fills `{{memory}}`. `scopedCharacterId` is always a real
 *  `CharacterId`, never a `''` sentinel. Unique key: `(chatId, scopedCharacterId, tier, blockIdx)`. */
export interface DigestStoreParams extends EmbedAbortParams {
  readonly lens: "digest";
  readonly ownerId: UserId;
  readonly chatId: ChatId;
  readonly scopedCharacterId: CharacterId;
  /** True when the block is from a group room (drives the egocentric-vs-shared recall split). */
  readonly isGroup: boolean;
  /** The consolidation tier (0 = a single block; `k>0` = a cross-block synthesis). */
  readonly tier: number;
  readonly blockIdx: number;
  readonly text: string;
  /** The mandatory `[entities — scene]` first line, kept as a retrieval facet. */
  readonly topicAnchor: string;
  readonly keywords: readonly string[];
  /** The characters this digest contains — persisted as the `chat_digest_speakers` join so search/discovery
   *  find a character's moments across rooms regardless of egocentric bucketing. May be empty. */
  readonly speakerCharacterIds: readonly CharacterId[];
  readonly contentHash: string;
  readonly model: string;
}

/** Embed a databank document chunk: the contracts data plus the sweep's abort. */
export interface DocumentChunkStoreParams extends DocumentChunkStoreInput, EmbedAbortParams {}

/** The single write path's input — discriminated on `lens`. `segment` is NOT an arm: verbatim segments are
 *  written in BATCHES through `storeSegments` (#172), the one place their corpus-wide embed flood lives. */
export type StoreParams = CardTextStoreParams | ImageRawStoreParams | ImageCaptionedStoreParams | DigestStoreParams | DocumentChunkStoreParams;

/** `embedCorpus` / `embedAssets` input — the resumable, `content_hash`-gated bulk sweep. `force` re-embeds
 *  matched rows; `signal` is the cooperative abort, checked between items and at any wait on the model
 *  ({@link EmbedAbortParams}). */
export interface EmbedPassParams {
  readonly force: boolean;
  /** Automatic vector rebuilds retain Utility analysis; an explicit force regenerates it. */
  readonly embedderChanged?: boolean | undefined;
  readonly signal: AbortSignal;
  /** Scope to one owner; `null` = every owner. Rows themselves stay owner-less — this only narrows which
   *  producers the pass reads. */
  readonly ownerId: UserId | null;
  /** Per-item position, for the caller's progress surface: called after each item with how many of the
   *  enumerated total are done. Absent = a silent pass (every non-workload caller). The pass is the ONLY
   *  place that knows its denominator — the workload wrapper enumerates nothing (issue #166 rider 3). */
  readonly onProgress?: ((done: number, total: number) => void) | undefined;
}
