// The FIXED payloads' hint sets: the blessed built-in look IS the general
// renderer applied to a hinted schema — the owner's standing directive ("the built-in fixed payload is
// ONE INSTANCE of a general renderer") made mechanical. The zod contracts carry no x-orb-ui, so these
// overlay by JSON-pointer path onto `projectJsonSchema(REFINERY_STAGE_PAYLOADS[stage])`. Keyed per
// stage; the derivation-pin test asserts the mock anatomy falls out of plan + hints alone.

import type { RefineryStage, RenderHint } from "@orb/contracts/refinery";
import type { HintOverlay } from "./render-plan.ts";

const VERDICT_TONES: RenderHint["tone"] = {
  // The uppercase spellings are the wire enum's own — the banner words ARE the data (word-primary).
  // biome-ignore lint/style/useNamingConvention: the key IS the canonical wire verdict member (`REFINERY_VERDICTS`, @orb/contracts/refinery) — a camelCase respell would break the tone lookup.
  ACCEPT: "good",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  NEEDS_REFINEMENT: "warn",
  // biome-ignore lint/style/useNamingConvention: same — the wire verdict member.
  REGRESSION: "bad",
};

const SCORE_HINTS: HintOverlay = {
  "#/properties/overallScore": { role: "hero" },
  "#/properties/summary": { role: "prose", label: "Score · summary" },
  "#/properties/priorityImprovements": { label: "Priority improvements" },
  "#/properties/fieldScores": { label: "Per-field assay" },
};

const REWRITE_HINTS: HintOverlay = {
  "#/properties/fields": { label: "Rewritten fields" },
};

const ANALYZE_HINTS: HintOverlay = {
  "#/properties/verdict": { role: "verdict", tone: VERDICT_TONES },
  "#/properties/soulScore": { role: "axis", label: "Soul" },
  "#/properties/soulAssessment": { role: "prose", label: "Soul assessment" },
  "#/properties/preserved": { tone: {}, label: "Preserved" },
  "#/properties/lost": { label: "Lost" },
  "#/properties/gained": { label: "Gained" },
  "#/properties/issues": { label: "Issues" },
  "#/properties/recommendations": { label: "Recommendations" },
};

export const BUILTIN_STAGE_HINTS: Readonly<Record<RefineryStage, HintOverlay>> = {
  score: SCORE_HINTS,
  rewrite: REWRITE_HINTS,
  analyze: ANALYZE_HINTS,
};
