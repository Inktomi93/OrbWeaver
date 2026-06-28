// domain/embeddings/contract/params — the dispatch axes + the verb input shapes (the typed write surface).
//
// THE TWO §7.5 DISPATCH AXES (one importable canonical union each; derived from a tuple, never inline
// re-spelled — `no-inline-union-redecl`):
//   • SourceKind — the producer class (`card` | `avatar`). FLAG[PD-34]: `chat-block` (memory's
//     digest/segment producer) lands in Phase 5 when `memory` is built whole (ledger D16) → add the member
//     here + its store arm when the memory-digest seam wires up.
//   • SourceLens — the embedding lens. The IMAGE subset (`image-raw` | `image-captioned`) is NOT re-spelled
//     here — it DERIVES `IMAGE_LENSES` from `@orb/contracts/embeddings` (D34, the db `image_embeddings.lens`
//     column derives the SAME tuple). The text lens `card-text` is W2; FLAG[PD-34]: `segment` / `digest`
//     (memory's verbatim + distilled chat-block lenses) land in Phase 5 → extend `TEXT_LENSES` + the store
//     switch then (the `satisfies` belt below goes red until the new arms are routed).
//
// VECTOR_TABLES is the FULL four-table registry NOW (not phased): `discovery` (writeHubScores) + `search`
// (reads) + `clearTable` consume all four today, independent of which lenses the store verb routes in W2.

import type { ImageLens } from "@orb/contracts/embeddings";
import { IMAGE_LENSES } from "@orb/contracts/embeddings";
import type { AssetId, CharacterId } from "@orb/kit/ids";

// ── SourceKind (the producer-class dispatch axis) ─────────────────────────────
/** The producer classes whose content the store verb embeds in W2. FLAG[PD-34]: `chat-block` (P5). */
export const SOURCE_KINDS = ["card", "avatar"] as const;
/** The producer-class union — derived from {@link SOURCE_KINDS} (no inline re-spell, §7.5). */
export type SourceKind = (typeof SOURCE_KINDS)[number];

// ── SourceLens (the embedding-lens dispatch axis) ─────────────────────────────
/** The TEXT lenses (W2: just `card-text`). FLAG[PD-34]: `segment` / `digest` (P5 memory chat-block). */
export const TEXT_LENSES = ["card-text"] as const;
/** Every lens the store verb routes — the text lenses + the canonical image subset (DERIVES `IMAGE_LENSES`,
 *  never re-spells it). `as const` over two const tuples yields the precise readonly tuple. */
export const SOURCE_LENSES = [...TEXT_LENSES, ...IMAGE_LENSES] as const;
/** The lens union — `card-text | image-raw | image-captioned` (W2). `ImageLens` is the contracts subset. */
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
}

/** Embed an avatar image's pure visual signal (no caption influence). Unique key: `(assetId, model, lens)`. */
export interface ImageRawStoreParams {
  readonly kind: "avatar";
  readonly lens: "image-raw";
  readonly assetId: AssetId;
  readonly content: Uint8Array;
  readonly model: string;
  readonly dim: number;
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
}

/** The single write path's input — discriminated on `lens` (W2 arms). FLAG[PD-34]: the `segment` /
 *  `digest` arms (memory chat-block, with `chatId`/`scopedCharacterId`/`tier`/`blockIdx` + speaker sync)
 *  join in Phase 5. */
export type StoreParams = CardTextStoreParams | ImageRawStoreParams | ImageCaptionedStoreParams;

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
