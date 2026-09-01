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

interface FamilyCheckResult {
  readonly findings: readonly Finding[];
  readonly scans: number;
}

type FamilyChecker = (samples: RawSamples) => FamilyCheckResult;

interface MutableFamilyCheckResult {
  readonly findings: Finding[];
  scans: number;
}

function emptyFamilyResult(): MutableFamilyCheckResult {
  return { findings: [], scans: 0 };
}

function nullableFindings<T>(items: readonly T[], check: (item: T) => Finding | null): Finding[] {
  const findings: Finding[] = [];
  for (const item of items) {
    const finding = check(item);
    if (finding !== null) {
      findings.push(finding);
    }
  }
  return findings;
}

function runNullable(state: MutableFamilyCheckResult, detector: () => Finding | null): void {
  state.scans += 1;
  const finding = detector();
  if (finding !== null) {
    state.findings.push(finding);
  }
}

function runArray(state: MutableFamilyCheckResult, detector: () => readonly Finding[]): void {
  state.scans += 1;
  state.findings.push(...detector());
}

function a11yFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => nullableFindings(samples.tapTargets, (target) => checkTapTarget(target, samples.pointerCoarse)));
  runArray(state, () => nullableFindings(samples.controlAspects ?? [], checkControlAspect));
  runArray(state, () => nullableFindings(samples.accessibleNames, checkAccessibleName));
  runNullable(state, () => checkMainLandmark({ main: samples.mainLandmarkPresent }));
  runArray(state, () => nullableFindings(samples.tabIndexes, checkTabIndexSmell));
  runArray(state, () => checkHeadingOrder(samples.headings));
  runArray(state, () => (samples.obscuredTargets ?? []).map(checkObscuredTarget));
  return state;
}

function colorFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => nullableFindings(samples.texts, checkContrast));
  runArray(state, () => nullableFindings(samples.texts, checkGrayOnColor));
  return state;
}

function decorFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => samples.accentBorders.flatMap(checkAccentBorder));
  runArray(state, () => nullableFindings(samples.shadowGlows, checkGlowShadow));
  return state;
}

function mediaFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => nullableFindings(samples.images, checkImageDistortion));
  runArray(state, () => samples.brokenImages.map(checkBrokenImage));
  return state;
}

function ornamentFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => nullableFindings(samples.radialGlows, checkRadialGlow));
  runArray(state, () => nullableFindings(samples.bgPatterns, checkBgPattern));
  runArray(state, () => nullableFindings(samples.iconTiles, checkIconTile));
  runArray(state, () => nullableFindings(samples.motionStatics, checkMotionStatic));
  return state;
}

function qualityFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => checkDuplicateDoors(samples.actionDoors ?? []));
  runArray(state, () => samples.overflows.map(checkTextOverflow));
  runArray(state, () => samples.repeatedTexts.map(checkRepeatedText));
  runArray(state, () => samples.clippedOverflows.map(checkClippedOverflow));
  runArray(state, () => samples.edgeFlushCards.map(checkEdgeFlush));
  // The #816 collision families: text erased to zero width, and a painted element whose own centre
  // belongs to a neighbour. Optional on the sample bundle — a pinned pre-#816 fixture set censused
  // neither, and an absent family is silence about a question nobody asked, not a clean answer.
  runArray(state, () => (samples.truncatedTexts ?? []).map(checkTruncatedText));
  return state;
}

function structureFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => nullableFindings(samples.zIndexes, checkZIndex));
  runArray(state, () => nullableFindings(samples.nestedCards, checkNestedCard));
  runArray(state, () => nullableFindings(samples.gradientTexts, checkGradientText));
  runArray(state, () => nullableFindings(samples.animatedImgHovers, checkAnimatedImgHover));
  return state;
}

function typographyFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => samples.textStyles.flatMap(checkTextStyle));
  runArray(state, () => checkCaveatHierarchy(samples.textStyles));
  runArray(state, () => checkFontCensus(samples.fontCensus));
  return state;
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
