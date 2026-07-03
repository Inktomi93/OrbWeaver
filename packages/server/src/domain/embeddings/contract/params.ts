// domain/embeddings/contract/params — the dispatch axes + the verb input shapes (the typed write surface).
//
// THE TWO §7.5 DISPATCH AXES (one importable canonical union each; derived from a tuple, never inline
// re-spelled — `no-inline-union-redecl`):
//   • SourceKind — the producer class (`card` | `avatar` | `chat-block`). `chat-block` is memory's
//     digest/segment producer (domains/memory.md §1; the memory rework, ledger D16).
//   • SourceLens — the embedding lens. The IMAGE subset (`image-raw` | `image-captioned`) is NOT re-spelled
//     here — it DERIVES `IMAGE_LENSES` from `@orb/contracts/embeddings` (D34, the db `image_embeddings.lens`
//     column derives the SAME tuple). The text lenses are `card-text` + `segment` / `digest` (memory's
//     verbatim + distilled chat-block lenses — domains/memory.md §2).
//
// VECTOR_TABLES is the FULL four-table registry: `discovery` (writeHubScores) + `search` (reads) +
// `clearTable` consume all four.

import type { ImageLens } from "@orb/contracts/embeddings";
import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import type { AssetId, CharacterId, ChatId } from "@orb/kit/ids";

// ── SourceKind (the producer-class dispatch axis) ─────────────────────────────
/** The producer classes whose content the store verb embeds: `card` (a character card), `avatar` (an asset
 *  image), `chat-block` (memory's verbatim segment + distilled digest of an aged-out chat block, §1). */
export const SOURCE_KINDS = ["card", "avatar", "chat-block"] as const;
/** The producer-class union — derived from {@link SOURCE_KINDS} (no inline re-spell, §7.5). */
export type SourceKind = (typeof SOURCE_KINDS)[number];

// ── SourceLens (the embedding-lens dispatch axis) ─────────────────────────────
/** The TEXT lenses: `card-text` (the card lens, W2) + `segment` (verbatim chat block, §2a) + `digest` (the
 *  distilled chat block, §2b). Each text lens's store arm carries the per-lens facets the §3 recall reads. */
export const TEXT_LENSES = ["card-text", "segment", "digest"] as const;
/** Every lens the store verb routes — the text lenses + the canonical image subset (DERIVES `IMAGE_LENSES`,
 *  never re-spells it). `as const` over two const tuples yields the precise readonly tuple. */
export const SOURCE_LENSES = [...TEXT_LENSES, ...IMAGE_LENSES] as const;
/** The lens union — `card-text | segment | digest | image-raw | image-captioned`. `ImageLens` is the
 *  contracts subset. */
export type SourceLens = (typeof TEXT_LENSES)[number] | ImageLens;

// ── VectorTable (the primary-vector-table registry) ───────────────────────────
/** The four primary vector tables `embeddings` owns. The SINGLE registry (§invariant 6) — `clearTable`,
 *  `writeHubScores`, `discovery`, `search`, and tests all consume this tuple; a new table is added HERE or
 *  the branded {@link VectorTable} union rejects the call (`tsc`). Re-exported from the front door. */
export const VECTOR_TABLES = [
  "character_embeddings",
  "image_embeddings",
  "chat_digests",
  "chat_segments",
] as const;
/** The primary-vector-table union — derived from {@link VECTOR_TABLES} (no inline re-spell). */
export type VectorTable = (typeof VECTOR_TABLES)[number];

// ── store params (a discriminated union on `lens` — type-safe per-lens content + FK refs) ──────────────
// The producer FK is a BRANDED, typed field per arm (not an untyped `key: string` / a nested `fkRefs`
// grab-bag) — born-compliant typing: a card arm cannot carry an assetId, an image arm cannot omit one, and
// `image-captioned` cannot omit its caption. There is NO `ownerId`/`principal` field (D20 — the vector
// substrate FKs to its producer and never denormalizes ownership; owner-scope derives at search time).
// `model` + `dim` are the `(model, dim)` SPACE TAG the caller declares (the composition root binds them from
// `connection.resolveRole(embed)` / the `RoleClients` bundle, so the declared model == the bound embed
// model); `store` stamps them and uses `dim` as the store-time space tripwire.

/** Embed a character card's text (`character.updated` indexer path). Unique key: `(characterId, model)`. */
export interface CardTextStoreParams {
  readonly kind: "card";
  readonly lens: "card-text";
  readonly characterId: CharacterId;
  readonly content: string;
  readonly model: string;
  readonly dim: number;
  /** Re-embed even when the stored `content_hash` matches (the PD-53 bulk re-index escape hatch — the
   *  ONE write path stays the only inserter; force just bypasses the staleness short-circuit). */
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
  /** Re-embed even on a matched `content_hash` (PD-53 bulk re-index; see {@link CardTextStoreParams}). */
  readonly force?: boolean | undefined;
}

/** Embed an avatar image jointly with its generated caption (image bytes + caption → one VL vector). The
 *  caption is also persisted on the row. Unique key: `(assetId, model, lens)`. */
export interface ImageCaptionedStoreParams {
  readonly kind: "avatar";
  readonly lens: "image-captioned";
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  /** The caption combined into the embed input AND written to `image_embeddings.caption`. */
  readonly caption: string;
  /** Caption provenance sidecar (model/elapsed/…) → `image_embeddings.caption_meta`. */
  readonly captionMeta?: Record<string, unknown> | undefined;
  readonly model: string;
  readonly dim: number;
  /** Re-embed even on a matched `content_hash` (PD-53 bulk re-index; see {@link CardTextStoreParams}). */
  readonly force?: boolean | undefined;
}

/** Embed an aged-out chat block's VERBATIM transcript (the §2a segment lens — the ground truth a digest hit
 *  resolves back to). `text` is the embed input AND the stored `chat_segments.text`. `contentHash` is
 *  PRECOMPUTED by memory (it folds the seq-span + the stable speaker id + the scope — §1; the store does not
 *  recompute it). Unique key: `(chatId, blockIdx)`. */
export interface SegmentStoreParams {
  readonly kind: "chat-block";
  readonly lens: "segment";
  readonly chatId: ChatId;
  readonly blockIdx: number;
  /** The seq-span back to `messages` canon (`chat_segments.seq_start` / `seq_end`). */
  readonly seqStart: number;
  readonly seqEnd: number;
  /** The verbatim block transcript — embedded AND persisted (`chat_segments.text`). */
  readonly text: string;
  /** The staleness/collapse key, precomputed by memory (folds seq-span + speaker + scope, §1). */
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
}

/** Embed an aged-out chat block's DISTILLED digest (the §2b digest lens — the sharp search key). `text` is
 *  the distilled body (topicAnchor + facts + keywords folded) — the embed input, the stored
 *  `chat_digests.text`, AND what fills `{{memory}}`. `scopedCharacterId` is ALWAYS a real `CharacterId`
 *  (inv 8 — solo's cast char / the synthetic group-as-character / a per-witnessing char; NO `''`, NO NULL).
 *  `contentHash` is PRECOMPUTED by memory (folds scope/speaker, §1). Unique key:
 *  `(chatId, scopedCharacterId, tier, blockIdx)`. */
export interface DigestStoreParams {
  readonly kind: "chat-block";
  readonly lens: "digest";
  readonly chatId: ChatId;
  /** The egocentric scope bucket (§4 / inv 8) — a real `CharacterId`, never the `''` sentinel. */
  readonly scopedCharacterId: CharacterId;
  /** True when the block is from a group room (drives the egocentric-vs-shared recall split). */
  readonly isGroup: boolean;
  /** The consolidation tier (0 = a single block; k>0 = a fanOut cross-block synthesis, §5). */
  readonly tier: number;
  readonly blockIdx: number;
  /** The distilled digest body — embedded, persisted (`chat_digests.text`), and injected into `{{memory}}`. */
  readonly text: string;
  /** The mandatory `[entities — scene]` first line, kept as a retrieval facet (`chat_digests.topic_anchor`). */
  readonly topicAnchor: string;
  /** The 15–30 distinctive retrieval keywords (`chat_digests.keywords`). */
  readonly keywords: readonly string[];
  /** The characters this digest CONTAINS (domains/memory.md §4) — persisted as the `chat_digest_speakers`
   *  join so search/discovery find a character's moments ACROSS rooms regardless of the egocentric bucketing.
   *  Distinct from `scopedCharacterId` (whose bucket this is): a merged-room digest is bucketed to the
   *  synthetic group char but CONTAINS the real speakers. May be empty (a no-speaker block). */
  readonly speakerCharacterIds: readonly CharacterId[];
  /** The staleness/collapse key, precomputed by memory (folds scope + speaker + seq-span, §1/§4). */
  readonly contentHash: string;
  readonly model: string;
  readonly dim: number;
}

/** The single write path's input — discriminated on `lens`; all five arms are routed by `verbs/store.ts`'s
 *  exhaustive switch. */
export type StoreParams =
  | CardTextStoreParams
  | ImageRawStoreParams
  | ImageCaptionedStoreParams
  | SegmentStoreParams
  | DigestStoreParams;

// ── bulk embed-pass params (the PD-53 catch-up sweep verbs) ───────────────────
/** `embedCorpus` / `embedAssets` input — the resumable, `content_hash`-gated bulk sweep over the whole
 *  corpus/asset store. `force` re-embeds matched rows (else the hash gate skips them — a rerun after an
 *  abort/failure resumes the remainder for free). `signal` is the cooperative abort, checked BETWEEN items
 *  (every completed item is durable + idempotent — the `backfillMemory` precedent). */
export interface EmbedPassParams {
  readonly force: boolean;
  readonly signal: AbortSignal;
}

// ── writeHubScores params (the discovery → embeddings hub-score write seam) ────
/** One pre-computed hub-score update — keyed `(id, model)` so it lands on the right row in the right space.
 *  `id` is the row PK (a generic string — the four tables have distinct id brands). */
export interface HubScoreUpdate {
  readonly id: string;
  readonly model: string;
  readonly hubScore: number;
}

/** `writeHubScores` input — the table + the pre-computed batch. The ONLY non-`store` write surface, and the
 *  ONLY path that touches `hub_score` (§invariant 3). No CSLS math here — `discovery` computes, this stores. */
export interface WriteHubScoresParams {
  readonly table: VectorTable;
  readonly updates: readonly HubScoreUpdate[];
}

// ── clearTable params (the maintenance DELETE-FROM) ───────────────────────────
/** `clearTable` input — the typed table to wipe (a plain `DELETE FROM`; safe, no ANN shadow index). */
export interface ClearTableParams {
  readonly table: VectorTable;
}
