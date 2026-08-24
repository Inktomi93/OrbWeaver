// Pure, DOM-free classification AGGREGATION for ui-audit — collectFindings walks every sample
// family through its check. Split from the pre-move design-audit-checks.ts (P3 of #393).
//
// WCAG contrast formula + large-text thresholds are standard WCAG 2.x math, not reinvented.
//
// PROVENANCE / ATTRIBUTION: every check whose Finding carries `origin: "impeccable"` adapts a
// detection recipe from pbakaus/impeccable (https://github.com/pbakaus/impeccable,
// cli/engine/rules/checks.mjs + registry/antipatterns.mjs — Copyright 2025 Paul Bakaus,
// Apache License 2.0), MODIFIED for orbweaver: thresholds re-bound to the live token ramp
// (`@orb/ui/tokens`), owner-sacred effect axes exempted, severities mapped to our P0–P3.
// Full 59-rule triage + license statement:
// .claude/skills/side-eye-design-review/reference/impeccable-adoption.md
import type { Finding } from "../contract/findings.ts";
import type { RawSamples } from "../contract/samples.ts";
import { checkAccessibleName, checkControlAspect, checkHeadingOrder, checkMainLandmark, checkTabIndexSmell, checkTapTarget } from "./checks-a11y.ts";
import { checkContrast, checkGrayOnColor } from "./checks-color.ts";
import { checkAccentBorder, checkGlowShadow } from "./checks-decor.ts";
import { checkBrokenImage, checkImageDistortion } from "./checks-media.ts";
import { checkBgPattern, checkIconTile, checkMotionStatic, checkRadialGlow } from "./checks-ornament.ts";
import { checkClippedOverflow, checkDuplicateDoors, checkEdgeFlush, checkRepeatedText, checkTextOverflow } from "./checks-quality.ts";
import { checkAnimatedImgHover, checkGradientText, checkNestedCard, checkZIndex } from "./checks-structure.ts";
import { checkCaveatHierarchy, checkFontCensus, checkTextStyle } from "./checks-typography.ts";

/** Runs one nullable check over one sample array, pushing every non-null Finding. */
function pushFindings<T>(findings: Finding[], items: readonly T[], check: (item: T) => Finding | null): void {
  for (const item of items) {
    const f = check(item);
    if (f !== null) {
      findings.push(f);
    }
  }
}

/** Runs one array-returning check over one sample array. */
function pushAllFindings<T>(findings: Finding[], items: readonly T[], check: (item: T) => Finding[]): void {
  for (const item of items) {
    findings.push(...check(item));
  }
}

/** Runs every check over a raw-sample bundle — the one place that fans a page's facts out to findings. */
export function collectFindings(samples: RawSamples): Finding[] {
  const findings: Finding[] = [];
  pushFindings(findings, samples.texts, checkContrast);
  pushFindings(findings, samples.texts, checkGrayOnColor);
  pushFindings(findings, samples.images, checkImageDistortion);
  pushFindings(findings, samples.tapTargets, (t) => checkTapTarget(t, samples.pointerCoarse));
  pushFindings(findings, samples.controlAspects ?? [], checkControlAspect);
  pushFindings(findings, samples.accessibleNames, checkAccessibleName);
  findings.push(...checkDuplicateDoors(samples.actionDoors ?? []));
  const landmark = checkMainLandmark({ main: samples.mainLandmarkPresent });
  if (landmark !== null) {
    findings.push(landmark);
  }
  pushFindings(findings, samples.tabIndexes, checkTabIndexSmell);
  pushFindings(findings, samples.zIndexes, checkZIndex);
  pushFindings(findings, samples.nestedCards, checkNestedCard);
  pushFindings(findings, samples.gradientTexts, checkGradientText);
  pushFindings(findings, samples.animatedImgHovers, checkAnimatedImgHover);
  pushAllFindings(findings, samples.textStyles, checkTextStyle);
  // A CROSS-sample fold: type-hierarchy inversion is a claim about a PAIR, so it takes the whole family.
  findings.push(...checkCaveatHierarchy(samples.textStyles));
  pushAllFindings(findings, samples.accentBorders, checkAccentBorder);
  pushFindings(findings, samples.shadowGlows, checkGlowShadow);
  pushFindings(findings, samples.radialGlows, checkRadialGlow);
  pushFindings(findings, samples.bgPatterns, checkBgPattern);
  pushFindings(findings, samples.iconTiles, checkIconTile);
  pushFindings(findings, samples.motionStatics, checkMotionStatic);
  findings.push(...checkFontCensus(samples.fontCensus));
  findings.push(...samples.brokenImages.map(checkBrokenImage));
  findings.push(...checkHeadingOrder(samples.headings));
  findings.push(...samples.overflows.map(checkTextOverflow));
  findings.push(...samples.repeatedTexts.map(checkRepeatedText));
  findings.push(...samples.clippedOverflows.map(checkClippedOverflow));
  findings.push(...samples.edgeFlushCards.map(checkEdgeFlush));
  return findings;
}
