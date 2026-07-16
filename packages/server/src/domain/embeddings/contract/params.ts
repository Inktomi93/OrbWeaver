// The dispatch axes (SourceKind, SourceLens) + the verb input shapes for the embeddings write surface.

import type { ImageLens } from "@orb/contracts/embeddings";
import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import type { AssetId, CharacterId, ChatId, UserId } from "@orb/kit/ids";

/** The producer classes whose content the store verb embeds. */
export const SOURCE_KINDS = ["card", "avatar", "chat-block"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const TEXT_LENSES = ["card-text", "segment", "digest"] as const;
export const SOURCE_LENSES = [...TEXT_LENSES, ...IMAGE_LENSES] as const;
export type SourceLens = (typeof TEXT_LENSES)[number] | ImageLens;

/** The primary vector tables `embeddings` owns — the single registry all callers derive from. */
export const VECTOR_TABLES = ["character_embeddings", "image_embeddings", "chat_digests", "chat_segments"] as const;
export type VectorTable = (typeof VECTOR_TABLES)[number];

// Store params: a discriminated union on `lens`. No ownerId/principal field — vector rows FK to their
// producer only; owner-scope derives at search time.

/** Embed a character card's text. Unique key: `(characterId, model)`. */
export interface CardTextStoreParams {
  readonly kind: "card";
  readonly lens: "card-text";
  readonly characterId: CharacterId;
  readonly content: string;
  readonly model: string;
  readonly dim: number;
  /** Re-embed even when the stored `content_hash` matches. */
  readonly force?: boolean | undefined;
}

/** Embed an avatar image's pure visual signal (no caption influence). Unique key: `(assetId, model, lens)`. */
export interface ImageRawStoreParams {
  readonly kind: "avatar";
  readonly lens: "image-raw";
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  readonly model: string;
  readonly dim: number;
  /** Re-embed even on a matched `content_hash`. */
  readonly force?: boolean | undefined;
}

/** Embed an avatar image jointly with its generated caption (image bytes + caption → one VL vector). The
 *  caption is also persisted on the row. Unique key: `(assetId, model, lens)`. */
export interface ImageCaptionedStoreParams {
  readonly kind: "avatar";
  readonly lens: "image-captioned";
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  /** Combined into the embed input AND written to `image_embeddings.caption`. */
  readonly caption: string;
  /** Caption provenance sidecar (model/elapsed/…) → `image_embeddings.caption_meta`. */
  readonly captionMeta?: Record<string, unknown> | undefined;
  readonly model: string;
  readonly dim: number;
  /** Re-embed even on a matched `content_hash`. */
  readonly force?: boolean | undefined;
}

/** Embed an aged-out chat block's verbatim transcript. `text` is the embed input AND the stored
 *  `chat_segments.text`. `contentHash` is precomputed by memory (not recomputed here). Unique key:
 *  `(chatId, blockIdx)`. */
export interface SegmentStoreParams {
  readonly kind: "chat-block";
  readonly lens: "segment";
  readonly chatId: ChatId;
  readonly blockIdx: number;
  readonly seqStart: number;
  readonly seqEnd: number;
  /** The verbatim block transcript — embedded AND persisted (`chat_segments.text`). */
  readonly text: string;
  /** Staleness/collapse key, precomputed by memory. */
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
}

/** Embed an aged-out chat block's distilled digest. `text` is the distilled body — the embed input, the
 *  stored `chat_digests.text`, and what fills `{{memory}}`. `scopedCharacterId` is always a real
 *  `CharacterId`, never a `''` sentinel. Unique key: `(chatId, scopedCharacterId, tier, blockIdx)`. */
export interface DigestStoreParams {
  readonly kind: "chat-block";
  readonly lens: "digest";
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
  readonly dim: number;
}

/** The single write path's input — discriminated on `lens`. */
export type StoreParams = CardTextStoreParams | ImageRawStoreParams | ImageCaptionedStoreParams | SegmentStoreParams | DigestStoreParams;

/** `embedCorpus` / `embedAssets` input — the resumable, `content_hash`-gated bulk sweep. `force` re-embeds
 *  matched rows; `signal` is the cooperative abort, checked between items. */
export interface EmbedPassParams {
  readonly force: boolean;
  readonly signal: AbortSignal;
  /** Scope to one owner; `null` = every owner. Rows themselves stay owner-less — this only narrows which
   *  producers the pass reads. */
  readonly ownerId: UserId | null;
}

export interface HubScoreUpdate {
  readonly id: string;
  readonly model: string;
  readonly hubScore: number;
}

/** `writeHubScores` input — the only non-`store` write surface, and the only path that touches
 *  `hub_score`. `discovery` computes, this stores. */
export interface WriteHubScoresParams {
  readonly table: VectorTable;
  readonly updates: readonly HubScoreUpdate[];
}

export interface ClearTableParams {
  readonly table: VectorTable;
}
