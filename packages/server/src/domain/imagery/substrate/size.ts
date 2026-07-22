// domain/imagery/substrate/size — the semantic size presets (doc 02 §6). These are gpt-image-1's published
// size set: the most constrained mainstream hosted editor gets exact passthrough; every other hosted model
// snaps arbitrary dimensions to its own buckets anyway, so optimizing for the strictest wire wins.
//
// FORK 2 (doc 05, 2026-07-17): the substrate lands with I1; the REQUEST-passing (the runner reads `size`)
// rides I2 in the same commit as the domain-mirror widening — so SIZE_PRESETS/defaultSizeFor have no I1
// consumer yet (the born-compliant substrate posture, mirroring the INERT I0 contract widening).

import type { PromptTemplateMode, SizePresetName } from "@orb/contracts/imagery";

export const SIZE_PRESETS = {
  square: { width: 1024, height: 1024 },
  portrait: { width: 1024, height: 1536 },
  landscape: { width: 1536, height: 1024 },
} as const satisfies Record<SizePresetName, { readonly width: number; readonly height: number }>;

// biome-ignore-start lint/style/useNamingConvention: keyed by the canonical PROMPT_TEMPLATE_MODES literals (snake_case).
/** face/character → portrait; background/scenario → landscape; free → square. The mapped-Record dispatch
 *  (§5.5): a new tuple member fails `tsc` here until it declares its default. */
const DEFAULT_SIZE_BY_MODE: Record<PromptTemplateMode, SizePresetName> = {
  free: "square",
  character: "portrait",
  face: "portrait",
  scenario: "landscape",
  background: "landscape",
  character_multimodal: "portrait",
  face_multimodal: "portrait",
};
// biome-ignore-end lint/style/useNamingConvention: end the mode-literal-keyed default-size map.

export function defaultSizeFor(mode: PromptTemplateMode): SizePresetName {
  return DEFAULT_SIZE_BY_MODE[mode];
}
