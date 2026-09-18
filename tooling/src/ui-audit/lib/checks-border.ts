// THE FORM-CONTROL BOUNDARY VERDICT (`border-contrast`, WCAG 1.4.11 — #1361 folded into #1315).
//
// WCAG 1.4.11 asks that "visual information required to identify user interface components … [has] a
// contrast ratio of at least 3:1 against adjacent color(s)". A text field's border IS that information
// when the field declares one: it is the only thing saying where the input begins. #1361 is the measured
// instance — the chat search field's 1px border read 1.69:1 (dark) and 1.77:1 (light) against the surround
// on `[aria-label="Search chats"]`, which a reviewer found by eye because nothing swept for it.
//
// WHAT IS COMPARED, AND WHY IT IS NOT THE FILL. The walker hands over `resolveBackdropUnder(el)` — the
// paint OUTSIDE the control's box (ops/walker/census-border.ts's header carries the mechanism receipts).
// The control's own fill is the INSIDE of the boundary; comparing the border against it would answer a
// different question and would pass a border that is invisible against the page.
//
// TRANSLUCENT INK IS COMPOSITED, NEVER TRUSTED RAW. A border-color at alpha < 1 paints as a blend of the
// authored colour and whatever is behind it, and reading the authored rgb as if opaque is the same lie
// `checks-color.ts` records for backgrounds (the 1.11-vs-2.6 false FAIL). The composite uses the fleet's
// one home, `_shared/wcag.ts` `compositeForeground`.
//
// Pure; thresholds cited. Provenance: lib/collect.ts header.
import type { Rgb } from "@orb/tooling/_shared/wcag";
import { compositeForeground, contrastRatio, isContrastExempt, UI_COMPONENT_MIN_RATIO } from "@orb/tooling/_shared/wcag";
import type { Backdrop } from "../contract/backdrop.ts";
import type { CandidateDisposition, Finding } from "../contract/findings.ts";
import type { BorderContrastInput, BorderContrastSide } from "../contract/samples.ts";

/** Two decimals, the ratio spelling every other contrast rule in this tool prints. */
function ratioText(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

/** The one surround colour a ratio may be taken against, or null when the walker could not resolve one.
 *  `gradient` and `image-indeterminate` are deliberately NOT collapsed to a best stop here: a boundary
 *  against a gradient is a different (per-stop) question, and answering it from one stop would publish a
 *  number the eye cannot check. `unresolved` never reaches a ratio at all — its `fallback` is the
 *  pre-#218 fabricated composite, kept for non-verdict tells only (contract/backdrop.ts). */
function surroundColor(surround: Backdrop): Rgb | null {
  return surround.kind === "flat" ? surround.color : null;
}

/** WHAT A DECLARED SIDE ACTUALLY PAINTS. A side whose colour did not survive the walker's canvas probe is
 *  unreadable, not clean — the caller withholds on it. */
function paintedInk(side: BorderContrastSide, surround: Rgb): Rgb | null {
  const color = side.color;
  if (color === null) {
    return null;
  }
  const alpha = color.a ?? 1;
  return alpha >= 1 ? color : compositeForeground(color, surround, alpha);
}

interface WorstSide {
  readonly side: BorderContrastSide;
  readonly ratio: number;
}

function worstDeclaredSide(sides: readonly BorderContrastSide[], surround: Rgb): WorstSide | null {
  let worst: WorstSide | null = null;
  for (const side of sides) {
    const ink = paintedInk(side, surround);
    if (ink === null) {
      continue;
    }
    const ratio = contrastRatio(ink, surround);
    if (worst === null || ratio < worst.ratio) {
      worst = { side, ratio };
    }
  }
  return worst;
}

/** A candidate whose EVERY declared side has an unreadable colour — the sides exist, so the control did
 *  make a boundary claim, and none of it could be measured. Withheld, never excluded. */
function everySideUnreadable(sides: readonly BorderContrastSide[]): boolean {
  return sides.length > 0 && sides.every((side) => side.color === null);
}

export function classifyBorderContrast(input: BorderContrastInput): CandidateDisposition {
  // NO DECLARED BORDER IS NOT A DEFECT. A control separated by fill, elevation or a label made no
  // boundary claim for this rule to judge — a closed, printed exclusion (tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md step 4), and
  // the single biggest false-positive class this rule would otherwise carry.
  if (input.sides.length === 0) {
    return { kind: "excluded", reason: "noDeclaredBorder" };
  }
  // WCAG 1.4.11's own exemption: "inactive user interface components" owe no non-text contrast. The
  // classifier is the fleet-shared one (_shared/wcag.ts), so this rule cannot disagree with snap's
  // `--contrast` about which control is inactive — the #624 divergence, one rule over.
  if (isContrastExempt(input.inactiveKind)) {
    return { kind: "excluded", reason: "inactiveExempt" };
  }
  const surround = surroundColor(input.surround);
  if (surround === null) {
    return { kind: "withheld", reason: input.surround.kind === "unresolved" ? input.surround.reason : input.surround.kind };
  }
  if (everySideUnreadable(input.sides)) {
    return { kind: "withheld", reason: "borderColorUnreadable" };
  }
  const worst = worstDeclaredSide(input.sides, surround);
  if (worst === null) {
    return { kind: "withheld", reason: "borderColorUnreadable" };
  }
  return { kind: "judged", finding: borderFinding(input, worst) };
}

/** P2, deliberately: the control is present, named, operable and meets its target floor — what a boundary
 *  nobody can see costs is RECOGNITION of where the field is, which is the same class `control-aspect`
 *  sits at. It is not P1 (nothing is unreachable) and not P3 (a field whose edge is invisible is a real
 *  1.4.11 failure, not a polish note). */
function borderFinding(input: BorderContrastInput, worst: WorstSide): Finding | null {
  if (worst.ratio >= UI_COMPONENT_MIN_RATIO) {
    return null;
  }
  const control = input.role === null ? `<${input.tag}>` : `role="${input.role}"`;
  return {
    rule: "border-contrast",
    severity: "P2",
    selector: input.selector,
    value: `${ratioText(worst.ratio)} on the ${worst.side.side} border (${worst.side.widthPx}px ${worst.side.style})`,
    message: `${control} declares a border as its boundary, and that border reads ${ratioText(worst.ratio)} against the surface outside it — below WCAG 1.4.11's ${String(UI_COMPONENT_MIN_RATIO)}:1 for the visual information that identifies a component, so the edge of the control is not perceivable`,
    origin: "orbweaver",
  };
}

export function checkBorderContrast(input: BorderContrastInput): Finding | null {
  const disposition = classifyBorderContrast(input);
  return disposition.kind === "judged" ? disposition.finding : null;
}
