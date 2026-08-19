// domain/embeddings/substrate/image-admission — the image indexer's ADMISSION FLOOR: a pure verdict over an
// asset's bytes that decides whether it is big enough to be worth captioning + embedding. Zero I/O, zero
// domain state — the byte-facts come from the pure `@orb/kit/image-sniff` header parse (no decode), exactly
// as `infra/network/image-guard` composes a MAX-dimension policy over the same sniff. This is the MIN-side
// policy, homed in the domain because the threshold is an embeddings-indexer decision, not a kit primitive.
//
// WHY A FLOOR AT ALL: `asset.created` fires for every content-addressed image, and the bulk sweep enumerates
// every one. A degenerate asset — a 1×1 tracking-pixel, a placeholder, a favicon-sized sliver — carries no
// visual signal, yet before this gate its bytes were fed to the VL caption call AND the image-embed model,
// burning that compute to produce a caption of nothing and a degenerate vector that then pollutes the
// retrieval + discovery substrate. The floor refuses it BEFORE that spend; the caller records the refusal
// (`image_index_skips`) so it is idempotent + visible rather than re-attempted every indexer pass.
//
// THE THRESHOLD (`MIN_IMAGE_EDGE_PX`): reject when the SHORTER edge is under 16px. Min-edge, not area, so a
// 1×1000 sliver (area 1000, but one-pixel-thin) is caught alongside the 1×1. 16px is a conservative,
// clearly-degenerate line: it is below a single vision-transformer patch for the Qwen-VL family (~14–16px
// patches, then a 2× merge), so an image whose shorter edge is under it cannot fill even one visual patch
// and is upscaled into pure noise for both the caption and the embed. The motivating case is the 1×1
// placeholder; a real avatar is orders of magnitude larger. (The exact per-model processor minimum was not
// verifiable offline; the floor is deliberately conservative — it only refuses assets that are degenerate
// under any plausible reading, and it is one tunable constant here if that judgement ever needs to move.)

import { sniffImageBytes } from "@orb/kit/image-sniff";
import type { ImageAdmissionVerdict } from "../contract/results.ts";

/** The admission floor: an asset whose shorter edge is under this many pixels is refused before caption+embed
 *  spend. See the file header for the rationale. */
export const MIN_IMAGE_EDGE_PX = 16;

/**
 * Decide whether `bytes` fall below the image admission floor. `belowFloor` is `true` ONLY when the header
 * yields BOTH dimensions and the shorter one is `< MIN_IMAGE_EDGE_PX`. An unknown format or an unparseable
 * header (either dimension `null`) is NOT below-floor — the floor is a dimension gate, not a decode gate, so
 * such an asset proceeds to embed exactly as before. The returned `width`/`height` are the sniffed values
 * (or `null`), for the skip-record's attribution.
 */
export function imageBelowFloor(bytes: Uint8Array): ImageAdmissionVerdict {
  const sniffed = sniffImageBytes(bytes);
  const width = sniffed?.width ?? null;
  const height = sniffed?.height ?? null;
  if (width === null || height === null) {
    return { belowFloor: false, width, height };
  }
  return { belowFloor: Math.min(width, height) < MIN_IMAGE_EDGE_PX, width, height };
}
