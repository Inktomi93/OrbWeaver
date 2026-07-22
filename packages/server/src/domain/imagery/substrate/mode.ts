// domain/imagery/substrate/mode — mode classification over the @orb/contracts/imagery 7-tuple. The mode
// SUBSETS are DERIVED via Exclude/Extract (never re-spelled — no-inline-union-redecl); each guard narrows
// PromptTemplateMode so the template Records + the orchestrator's step-3 dispatch stay exhaustive under tsc
// (a new tuple member fails to key a Record / falls through a guard until it declares its arm).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { ExtractionMode, MultimodalMode, PortraitMode } from "../contract/params";

const MULTIMODAL_MODES = new Set<PromptTemplateMode>(["character_multimodal", "face_multimodal"]);
const PORTRAIT_MODES = new Set<PromptTemplateMode>(["character", "face", "character_multimodal", "face_multimodal"]);

/** A multimodal mode's text-extraction sibling — the no-avatar caption fallback (doc 02 §3 step 1) still
 *  describes the subject from the card's extracted keywords. */
// biome-ignore-start lint/style/useNamingConvention: keyed by the canonical PROMPT_TEMPLATE_MODES literals (snake_case).
const MULTIMODAL_TO_EXTRACTION: Record<MultimodalMode, ExtractionMode> = {
  character_multimodal: "character",
  face_multimodal: "face",
};
// biome-ignore-end lint/style/useNamingConvention: end the mode-literal-keyed map.

export function isMultimodalMode(mode: PromptTemplateMode): mode is MultimodalMode {
  return MULTIMODAL_MODES.has(mode);
}

/** True for the subject-bearing portrait modes the reuse gate scopes to (doc 03 §4.4). */
export function isPortraitMode(mode: PromptTemplateMode): mode is PortraitMode {
  return PORTRAIT_MODES.has(mode);
}

/** The extraction mode a multimodal mode falls back to when the subject has no avatar to caption. */
export function extractionFallbackFor(mode: MultimodalMode): ExtractionMode {
  return MULTIMODAL_TO_EXTRACTION[mode];
}
