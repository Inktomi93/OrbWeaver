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
import type { DesignAuditRuleFamily } from "../contract/rules.ts";
import { DESIGN_AUDIT_RULE_FAMILIES } from "../contract/rules.ts";
import type { RawSamples } from "../contract/samples.ts";
import {
  checkAccessibleName,
  checkControlAspect,
  checkHeadingOrder,
  checkMainLandmark,
  checkObscuredTarget,
  checkTabIndexSmell,
  checkTapTarget,
} from "./checks-a11y.ts";
import { checkContrast, checkGrayOnColor } from "./checks-color.ts";
import { checkAccentBorder, checkGlowShadow } from "./checks-decor.ts";
import { checkBrokenImage, checkImageDistortion } from "./checks-media.ts";
import { checkBgPattern, checkIconTile, checkMotionStatic, checkRadialGlow } from "./checks-ornament.ts";
import { checkClippedOverflow, checkDuplicateDoors, checkEdgeFlush, checkRepeatedText, checkTextOverflow, checkTruncatedText } from "./checks-quality.ts";
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

interface FamilyCheckResult {
  readonly findings: readonly Finding[];
  readonly scans: number;
}

type FamilyChecker = (samples: RawSamples) => FamilyCheckResult;

function a11yFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  pushFindings(findings, samples.tapTargets, (t) => checkTapTarget(t, samples.pointerCoarse));
  pushFindings(findings, samples.controlAspects ?? [], checkControlAspect);
  pushFindings(findings, samples.accessibleNames, checkAccessibleName);
  const landmark = checkMainLandmark({ main: samples.mainLandmarkPresent });
  if (landmark !== null) {
    findings.push(landmark);
  }
  pushFindings(findings, samples.tabIndexes, checkTabIndexSmell);
  findings.push(...checkHeadingOrder(samples.headings));
  pushFindings(findings, samples.obscuredTargets ?? [], checkObscuredTarget);
  return {
    findings,
    scans:
      2 +
      samples.tapTargets.length +
      (samples.controlAspects?.length ?? 0) +
      samples.accessibleNames.length +
      samples.tabIndexes.length +
      (samples.obscuredTargets?.length ?? 0),
  };
}

function colorFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  pushFindings(findings, samples.texts, checkContrast);
  pushFindings(findings, samples.texts, checkGrayOnColor);
  return { findings, scans: 1 + samples.texts.length * 2 };
}

function decorFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  pushAllFindings(findings, samples.accentBorders, checkAccentBorder);
  pushFindings(findings, samples.shadowGlows, checkGlowShadow);
  return { findings, scans: 1 + samples.accentBorders.length + samples.shadowGlows.length };
}

function mediaFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  pushFindings(findings, samples.images, checkImageDistortion);
  findings.push(...samples.brokenImages.map(checkBrokenImage));
  return { findings, scans: 1 + samples.images.length + samples.brokenImages.length };
}

function ornamentFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  pushFindings(findings, samples.radialGlows, checkRadialGlow);
  pushFindings(findings, samples.bgPatterns, checkBgPattern);
  pushFindings(findings, samples.iconTiles, checkIconTile);
  pushFindings(findings, samples.motionStatics, checkMotionStatic);
  return { findings, scans: 1 + samples.radialGlows.length + samples.bgPatterns.length + samples.iconTiles.length + samples.motionStatics.length };
}

function qualityFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  findings.push(...checkDuplicateDoors(samples.actionDoors ?? []));
  findings.push(...samples.overflows.map(checkTextOverflow));
  findings.push(...samples.repeatedTexts.map(checkRepeatedText));
  findings.push(...samples.clippedOverflows.map(checkClippedOverflow));
  findings.push(...samples.edgeFlushCards.map(checkEdgeFlush));
  // The #816 collision families: text erased to zero width, and a painted element whose own centre
  // belongs to a neighbour. Optional on the sample bundle — a pinned pre-#816 fixture set censused
  // neither, and an absent family is silence about a question nobody asked, not a clean answer.
  findings.push(...(samples.truncatedTexts ?? []).map(checkTruncatedText));
  return {
    findings,
    scans:
      1 +
      samples.overflows.length +
      samples.repeatedTexts.length +
      samples.clippedOverflows.length +
      samples.edgeFlushCards.length +
      (samples.truncatedTexts?.length ?? 0),
  };
}

function structureFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  pushFindings(findings, samples.zIndexes, checkZIndex);
  pushFindings(findings, samples.nestedCards, checkNestedCard);
  pushFindings(findings, samples.gradientTexts, checkGradientText);
  pushFindings(findings, samples.animatedImgHovers, checkAnimatedImgHover);
  return { findings, scans: 1 + samples.zIndexes.length + samples.nestedCards.length + samples.gradientTexts.length + samples.animatedImgHovers.length };
}

function typographyFindings(samples: RawSamples): FamilyCheckResult {
  const findings: Finding[] = [];
  pushAllFindings(findings, samples.textStyles, checkTextStyle);
  findings.push(...checkCaveatHierarchy(samples.textStyles));
  findings.push(...checkFontCensus(samples.fontCensus));
  return { findings, scans: 2 + samples.textStyles.length };
}

/** Closed dispatcher: the registry owns the family vocabulary, and a family is counted only when its
 * checker actually executes. Removing a checker is a type error; bypassing dispatch leaves a zero. */
const AUDIT_FAMILY_CHECKERS: Readonly<Record<DesignAuditRuleFamily, FamilyChecker>> = {
  a11y: a11yFindings,
  color: colorFindings,
  decor: decorFindings,
  media: mediaFindings,
  ornament: ornamentFindings,
  quality: qualityFindings,
  structure: structureFindings,
  typography: typographyFindings,
};

export interface AuditCollection {
  readonly findings: readonly Finding[];
  readonly familyScans: Readonly<Record<DesignAuditRuleFamily, number>>;
}

/** Runs every enabled family through the same dispatch that produces its population evidence. */
export function collectAudit(samples: RawSamples): AuditCollection {
  const findings: Finding[] = [];
  const familyScans = Object.fromEntries(DESIGN_AUDIT_RULE_FAMILIES.map((family) => [family, 0])) as Record<DesignAuditRuleFamily, number>;
  for (const family of DESIGN_AUDIT_RULE_FAMILIES) {
    const result = AUDIT_FAMILY_CHECKERS[family](samples);
    findings.push(...result.findings);
    familyScans[family] += result.scans;
  }
  return { findings, familyScans };
}

export function collectFindings(samples: RawSamples): Finding[] {
  return [...collectAudit(samples).findings];
}

export function familyScanCounts(samples: RawSamples): Readonly<Record<DesignAuditRuleFamily, number>> {
  return collectAudit(samples).familyScans;
}
