// Cheap in-DOM antipatterns: z-index escalation, nested cards, gradient text, animated img-hover.
// Pure. Provenance: lib/collect.ts header.
import type { Finding } from "../contract/findings.ts";
import type { AnimatedImgHoverInput, GradientTextInput, NestedCardInput, ZIndexInput } from "../contract/samples.ts";

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
