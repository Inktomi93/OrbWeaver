// Cheap in-DOM antipatterns: z-index escalation, nested cards, gradient text, animated img-hover.
// Pure. Provenance: lib/collect.ts header.
import type { Finding } from "../contract/findings.ts";
import type { AnimatedImgHoverInput, CohortAnatomyInput, GradientTextInput, NestedCardInput, ZIndexInput } from "../contract/samples.ts";

// ── Cheap in-DOM antipatterns ────────────────────────────────────────────────
const Z_INDEX_THRESHOLD = 999;

const Z_INDEX_EGREGIOUS = 9999;

export function checkZIndex(input: ZIndexInput): Finding | null {
  if (input.zIndex < Z_INDEX_THRESHOLD) {
    return null;
  }
  return {
    rule: "z-index-escalation",
    severity: input.zIndex >= Z_INDEX_EGREGIOUS ? "P2" : "P3",
    selector: input.selector,
    value: `z-index: ${input.zIndex}`,
    message: `raw z-index ${input.zIndex} (≥${Z_INDEX_THRESHOLD}) — a stacking-context arms race; use the design system's layer tokens instead`,
    origin: "orbweaver",
  };
}

export function checkNestedCard(input: NestedCardInput): Finding | null {
  if (!input.isNested) {
    return null;
  }
  return {
    rule: "nested-card",
    severity: "P3",
    selector: input.selector,
    value: "card inside card",
    message: "a card-like element (shadow/border + radius/background) is nested inside another — flatten to one visual container",
    origin: "orbweaver",
  };
}

export function checkGradientText(input: GradientTextInput): Finding | null {
  if (!input.hasGradientText) {
    return null;
  }
  return {
    rule: "gradient-text",
    severity: "P3",
    selector: input.selector,
    value: "background-clip: text",
    message: "gradient-clipped text — contrast against every backdrop it can appear on is indeterminate; verify manually or use a solid color",
    origin: "orbweaver",
  };
}

/** A cohort must be off its own mode by BOTH a ratio and an absolute step before it is a finding. The
 *  ratio alone flags a 6px-vs-9px icon row; the step alone flags a 40px-vs-56px card that reads as one
 *  family. 1.5x AND 8px is the band where the eye stops reading the members as the same object — the
 *  config surface's P0 sat at 16px against a 32px mode (2.0x / 16px), and its `--mobile` twin at 16 vs
 *  44 (2.75x / 28px). */
const COHORT_MIN_RATIO = 1.5;
const COHORT_MIN_STEP_PX = 8;

/** ONE CONCEPT, TWO ANATOMIES (#978). Siblings that share the author's own kind-claim — same tag, same
 *  `data-slot`, same explicit role, one parent — are the population that should agree. When a minority of
 *  them renders at a materially different height, the surface says "these are the same thing" and the
 *  pixels say otherwise; a reviewer reads that as unfinished before they can name why.
 *
 *  P2, not P1: divergence is a coherence defect, not broken pixels. Where the short members ALSO fall
 *  under a target-size floor that is `tap-target`'s P1 to report — this rule's job is the inconsistency,
 *  and the two findings are complementary rather than duplicate. */
export function checkCohortAnatomy(input: CohortAnatomyInput): Finding | null {
  // A mid-transition member makes the spread a measurement of a moment. Declining is the honest verdict:
  // a settled re-run judges it, and a fabricated pass would be worse than silence.
  if (input.animating || input.outlierCount === 0) {
    return null;
  }
  const larger = Math.max(input.modeHeightPx, input.outlierHeightPx);
  const smaller = Math.min(input.modeHeightPx, input.outlierHeightPx);
  if (smaller <= 0 || larger - smaller < COHORT_MIN_STEP_PX || larger / smaller < COHORT_MIN_RATIO) {
    return null;
  }
  return {
    rule: "cohort-anatomy",
    severity: "P2",
    selector: input.outlierSelector,
    value: `${String(input.outlierCount)} of ${String(input.members)} at ${String(input.outlierHeightPx)}px, ${String(input.modeCount)} at ${String(input.modeHeightPx)}px (${input.cohortKey})`,
    message:
      "siblings built from ONE component render at materially different heights — the markup claims they are the same kind of row and the pixels disagree, which reads as unfinished before a user can name why. Give the cohort one height (a tv() size variant or a density slot in tiers.css, applied per-cohort), or split the odd members into their own component if they are genuinely a different thing",
    origin: "orbweaver",
  };
}

export function checkAnimatedImgHover(input: AnimatedImgHoverInput): Finding | null {
  if (!input.hasHoverAnimation) {
    return null;
  }
  return {
    rule: "animated-img-hover",
    severity: "P3",
    selector: input.selector,
    value: "hover transform/transition",
    message: "image animates (scale/rotate/translate) on hover — confirm this is intentional, not inherited card-hover motion",
    origin: "orbweaver",
  };
}
