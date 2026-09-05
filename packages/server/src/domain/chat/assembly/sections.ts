// domain/chat/assembly/sections — the GENERATION-AWARE section predicates. ONE home for "does this preset
// section actually render on THIS turn?", because two kinds of reader ask it and any disagreement between
// them is a silent prompt defect:
//   • the BUILD walk decides WHICH sections it emits (`assemble.ts`);
//   • every MARKER-FALLBACK decision routes content to a marker only when that marker will render, and
//     otherwise delivers the same content through its own channel — the guided steer's depth-0 injection
//     (`context.ts` resolveGuidedSteer), the implicit `compact_summary` synthesis (`assemble.ts`
//     withImplicitCompactSummary), and the two world-info anchors' bucket routing (`context.ts`).
//
// The fallback readers used to ask a weaker question — "is a section of this type present and enabled?" —
// which is TRUE for a section whose `trigger` array excludes this turn's generation type. The fallback stood
// down believing the marker would carry the text, the walk then dropped the trigger-mismatched section, and
// the content reached the model NOWHERE. Asking the same predicate the walk asks is what makes the two
// halves of every fallback decision agree by construction.
//
// The WI-anchor half had the defect UNDERNEATH that one: `plainMarkerSection` carried no `trigger` field at
// all, so those two anchors could not be gated even though ST sets `injection_trigger` on every
// prompt-manager entry — a parity GAP, not a design boundary (owner ruling, #1462). The field is on the plain
// markers now, so this predicate finally has something to read there.

import type { GenerationType, PromptConfig, PromptSection } from "@orb/contracts/preset";

/** The marker vocabulary, DERIVED from the section union (never re-spelled; §5.5). */
type MarkerName = Extract<PromptSection, { type: "marker" }>["marker"];

/** `regenerate` is a `swipe` for trigger purposes (the ST alias). */
function generationTypeBucket(t: GenerationType): GenerationType {
  return t === "regenerate" ? "swipe" : t;
}

/** ST `shouldTrigger`: a section with no trigger always fires; otherwise only when this turn's generation
 *  type matches one of its triggers (alias-normalized). */
export function sectionTriggers(section: PromptSection, generationType: GenerationType): boolean {
  const trigger = "trigger" in section ? section.trigger : undefined;
  if (trigger === undefined || trigger.length === 0) {
    return true;
  }
  const turn = generationTypeBucket(generationType);
  return trigger.some((t) => generationTypeBucket(t) === turn);
}

/** Will a `marker` section ACTUALLY render on this turn — present, enabled, AND trigger-matched? The ONE
 *  question a marker-fallback decision may ask: "enabled" alone is a claim about the preset, this is a claim
 *  about the TURN, and only the second one predicts whether the bytes get delivered. */
export function hasActiveMarker(config: PromptConfig, marker: MarkerName, generationType: GenerationType): boolean {
  return config.sections.some((s) => s.type === "marker" && s.marker === marker && s.enabled && sectionTriggers(s, generationType));
}
