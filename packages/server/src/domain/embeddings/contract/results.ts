import type { ImageCaptionMeta } from "@orb/contracts/embeddings";

export type { StoreResult } from "@orb/contracts/embeddings";

/** One owner's Utility analysis before persistence: caption and provenance/facets share one call.
 * An empty caption is the facetless skip signal. The indexer saves a successful annotation before
 * encoding, so a failed encoder does not repeat paid Utility work on the next pass. */
export interface AvatarAnalysis {
  readonly caption: string;
  readonly captionMeta: ImageCaptionMeta;
}

export interface StoredImageAnalysis extends AvatarAnalysis {
  readonly revision: number;
}

/** What the catch-up sweep needs to decide whether an asset's CAPTIONED lens is current: the bytes' hash and
 *  whether the stored `caption_meta` carries an actual facet breakdown.
 *
 *  `hasFacets` is `false` for every row written before the 2026-08-18 VL breakdown landed — those carry
 *  `{model}` only, and that is the ONLY signal a backfill has for finding them (the bytes hash still matches,
 *  so a hash-only currency test declares them current and the facet columns stay empty forever). */
export interface ExistingCaptionedRow {
  readonly hash: string;
  readonly hasFacets: boolean;
}

/** The image ADMISSION-FLOOR verdict (`substrate/image-admission`): whether an asset's header-parsed
 *  dimensions are too small to caption+embed, plus the sniffed dimensions for the skip-record's attribution.
 *  `belowFloor` is `true` ONLY when both edges are known AND the shorter one is under the floor — an
 *  unparseable header of a known format is NOT below-floor (the floor is a dimension gate, not a decode gate),
 *  so `width`/`height` are `null` there and the asset embeds as before. `recognized` is `false` when the bytes
 *  carry no known image signature at all: the stored file is not an image. */
export interface ImageAdmissionVerdict {
  readonly recognized: boolean;
  readonly belowFloor: boolean;
  readonly width: number | null;
  readonly height: number | null;
}

const IMAGE_SPACE_DEGRADES = ["no-image-embed-connection", "image-embed-model-takes-no-image-input"] as const;
/** WHY an owner's images fell back to the captioned-text lens (§10-3): either no `imageEmbed` connection is
 *  bound at all, or the bound one resolves to a model that declares no `image` input. Two causes, one
 *  behaviour, and both are said out loud — the pre-#10-3 indexer logged a debug line and dropped the image. */
export type ImageSpaceDegrade = (typeof IMAGE_SPACE_DEGRADES)[number];

/** WHERE an owner's pictures are embedded, and WHICH role op embeds into that space — the joint-space rule's
 *  answer (`substrate/task-model.ts::resolveImageSpace`).
 *
 *  `via: "imageEmbed"` is the full lens pair (`image-raw` pixels + `image-captioned` joint vector).
 *  `via: "embed"` is the CAPTIONED-TEXT fallback: the bytes cannot be embedded at all, so only the caption
 *  lands, as TEXT, in the owner's `embed` space — findable by an ordinary text query, which is the whole
 *  point of the fallback. `model` is the space tag either way, so the write side and `nearest.ts` filter on
 *  one string. */
export type ImageSpace =
  | { readonly via: "imageEmbed"; readonly model: string }
  | { readonly via: "embed"; readonly model: string; readonly degraded: ImageSpaceDegrade };
