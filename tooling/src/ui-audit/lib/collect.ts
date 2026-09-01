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
//
// FOUR COLLECTION STRATEGIES (owner ruling 2026-09-01: no gate — rule shape is a judgment call a
// checker can't make; this table is the enforcement). Pick your rung by what your samples need, not
// "finishing the migration" — rung 1 is a legitimate destination for a page-singleton, not debt.
// Mechanics (what each rung's function does, the reason-map semantics, the walker-filtered trap):
// lib/population-strategies.ts header.
// | rung | fn                     | example rules |
// | 1 | nullableFindings          | most rules (landmark-missing, script-error, flat-type-hierarchy, ...) |
// | 2 | accountedFindings         | quiet-state, double-empty-state, selection-idiom |
// | 3 | cappedRelationalFindings  | cohort-anatomy, row-void, pane-ink |
// | 4 | decisionPopulationFindings| tap-target, obscured-target, truncated-to-nothing, headline-overhang, inline-padding-leak, text-below-ramp, undersized-ui-text |
// Exception: duplicate-action-door has accounting via its OWN checkDuplicateDoorPopulations, not one of the four functions above (checks-quality.ts).
// Exception: hover-contrast likewise — hoverContrastPopulations (checks-hover.ts) MERGES a Node/CDP pass's
// census with the check's own dispositions, because its samples are gathered outside COLLECT_SAMPLES_JS.
// Exception: buried-raster likewise — checkBuriedRasterPopulations (checks-media.ts) owns its own
// candidates/judged/excluded(opacity-transition) accounting; the population is walker-gathered raster
// carriers with no upstream relational census to join.
import type { Finding, PopulationAccounting } from "../contract/findings.ts";
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
  checkTapTargetPopulations,
} from "./checks-a11y.ts";
import { checkContrast, checkGrayOnColor, checkQuietState, colorTextPopulations } from "./checks-color.ts";
import { checkAccentBorder, checkGlowShadow } from "./checks-decor.ts";
import { checkHoverContrast, hoverContrastPopulations } from "./checks-hover.ts";
import { checkBrokenImage, checkBuriedRasterPopulations, checkImageDistortion } from "./checks-media.ts";
import { checkBgPattern, checkIconTile, checkMotionStatic, checkRadialGlow } from "./checks-ornament.ts";
import {
  checkClippedOverflow,
  checkDoubleEmptyState,
  checkDuplicateDoorPopulations,
  checkEdgeFlush,
  checkHeadlineOverhang,
  checkInlinePaddingLeak,
  checkRepeatedText,
  checkTextOverflow,
  checkTierDrift,
  checkTruncatedText,
} from "./checks-quality.ts";
import {
  checkAnimatedImgHover,
  checkCohortAnatomy,
  checkGradientText,
  checkNestedCard,
  checkPaneInk,
  checkRowVoid,
  checkSelectionIdiom,
  checkZIndex,
} from "./checks-structure.ts";
import { checkCaveatHierarchy, checkFontCensus, checkTextStyle } from "./checks-typography.ts";
import { accountedFindings, cappedRelationalFindings, decisionPopulationFindings, nullableFindings } from "./population-strategies.ts";

interface FamilyCheckResult {
  readonly findings: readonly Finding[];
  readonly scans: number;
  readonly populationAccounting?: PopulationAccounting;
}

type FamilyChecker = (samples: RawSamples) => FamilyCheckResult;

interface MutableFamilyCheckResult {
  readonly findings: Finding[];
  scans: number;
}

function emptyFamilyResult(): MutableFamilyCheckResult {
  return { findings: [], scans: 0 };
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
  const tapTargets = checkTapTargetPopulations(samples.tapTargets, samples.pointerCoarse);
  if (samples.obscuredScan?.subjects !== undefined && samples.obscuredScan.subjects.length !== samples.obscuredScan.unaskable) {
    throw new Error(
      `INSTRUMENT ERROR: obscured unaskable population=${String(samples.obscuredScan.unaskable)} does not equal named subjects=${String(samples.obscuredScan.subjects.length)}`,
    );
  }
  const obscuredCensus =
    samples.relationalAccounting?.["obscured-target"] ??
    (samples.obscuredScan === undefined
      ? undefined
      : {
          candidates: samples.obscuredScan.candidates,
          judged: samples.obscuredScan.candidates - samples.obscuredScan.unaskable,
          withheld: { unaskable: samples.obscuredScan.unaskable },
          excluded: {},
        });
  const obscured = decisionPopulationFindings("obscured-target", samples.obscuredTargets ?? [], checkObscuredTarget, {
    decisionKey: (input) =>
      `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}\u0000${input.hitAuthoredTarget ?? input.hitSelector}\u0000${
        input.hitAuthoredHome ?? input.hitSelector
      }`,
    census: obscuredCensus,
  });
  runArray(state, () => tapTargets.findings);
  runArray(state, () => nullableFindings(samples.controlAspects ?? [], checkControlAspect));
  runArray(state, () => nullableFindings(samples.accessibleNames, checkAccessibleName));
  runNullable(state, () => checkMainLandmark({ main: samples.mainLandmarkPresent }));
  runArray(state, () => nullableFindings(samples.tabIndexes, checkTabIndexSmell));
  runArray(state, () => checkHeadingOrder(samples.headings));
  runArray(state, () => obscured.findings);
  return { ...state, populationAccounting: { "obscured-target": obscured.accounting, "tap-target": tapTargets.accounting } };
}

function colorFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const quiet = accountedFindings("quiet-state", samples.quietStates ?? [], checkQuietState, {
    census: samples.relationalAccounting?.["quiet-state"],
    samplesAreJudged: true,
  });
  // The FORCED-STATE family (ops/hover.ts). Its samples come from their own CDP-driven pass, so an absent
  // `hoverScan` is "the pass did not run" and publishes NO row — never a zero that reads as "checked".
  const hoverScan = samples.hoverScan;
  const hoverStates = samples.hoverStates ?? [];
  runArray(state, () => nullableFindings(samples.texts, checkContrast));
  runArray(state, () => nullableFindings(samples.texts, checkGrayOnColor));
  runArray(state, () => quiet.findings);
  runArray(state, () => nullableFindings(hoverStates, checkHoverContrast));
  return {
    ...state,
    populationAccounting: {
      ...colorTextPopulations(samples.texts),
      "quiet-state": quiet.accounting,
      ...(hoverScan === undefined ? {} : { "hover-contrast": hoverContrastPopulations(hoverStates, hoverScan) }),
    },
  };
}

function decorFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => samples.accentBorders.flatMap(checkAccentBorder));
  runArray(state, () => nullableFindings(samples.shadowGlows, checkGlowShadow));
  return state;
}

function mediaFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const buriedRasters = checkBuriedRasterPopulations(samples.buriedRasters ?? []);
  runArray(state, () => nullableFindings(samples.images, checkImageDistortion));
  runArray(state, () => samples.brokenImages.map(checkBrokenImage));
  runArray(state, () => buriedRasters.findings);
  return { ...state, populationAccounting: { "buried-raster": buriedRasters.accounting } };
}

function ornamentFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => nullableFindings(samples.radialGlows, checkRadialGlow));
  runArray(state, () => nullableFindings(samples.bgPatterns, checkBgPattern));
  runArray(state, () => nullableFindings(samples.iconTiles, checkIconTile));
  runArray(state, () => nullableFindings(samples.motionStatics, checkMotionStatic));
  return state;
}

/** The rung-4 grouping key every authored-identity family in this file uses: the authored target paired
 *  with its position-free home, NUL-joined so neither part can forge the boundary. Falls back to the
 *  selector for sample bundles that predate authored identity (#989), which groups per instance — the
 *  pre-#989 behavior — rather than collapsing unrelated rows under a shared `undefined`. */
function authoredDecisionKey(input: { readonly selector: string; readonly authoredTarget?: string; readonly authoredHome?: string }): string {
  return `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}`;
}

function qualityFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const duplicateDoors = checkDuplicateDoorPopulations(samples.actionDoors ?? []);
  const emptyStates = accountedFindings("double-empty-state", samples.emptyStates ?? [], checkDoubleEmptyState, {
    census: samples.relationalAccounting?.["double-empty-state"],
    samplesAreJudged: true,
  });
  const truncated = decisionPopulationFindings("truncated-to-nothing", samples.truncatedTexts ?? [], checkTruncatedText, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["truncated-to-nothing"],
  });
  // The two PLACEMENT-COLLISION arms (#816 ii/iii). Rung 4 rather than rung 2 because both repeat by
  // AUTHORED DECISION, not by instance: one misapplied `tv()` slot leaks on every row it renders, and
  // filing that per row would bury the single fix under its own blast radius.
  const overhangs = decisionPopulationFindings("headline-overhang", samples.headlineOverhangs ?? [], checkHeadlineOverhang, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["headline-overhang"],
  });
  const paddingLeaks = decisionPopulationFindings("inline-padding-leak", samples.inlinePaddingLeaks ?? [], checkInlinePaddingLeak, {
    decisionKey: authoredDecisionKey,
    census: samples.relationalAccounting?.["inline-padding-leak"],
  });
  // The density-tier self-oracle (packages/ui/src/styles/tiers.css): every judged (element, property)
  // pair, passing or failing, is returned — accountedFindings' samplesAreJudged=true requires the items
  // array to equal the census's own judged count.
  const tierDrift = accountedFindings("tier-drift", samples.tierDrifts ?? [], checkTierDrift, {
    census: samples.relationalAccounting?.["tier-drift"],
    samplesAreJudged: true,
  });
  runArray(state, () => duplicateDoors.findings);
  runArray(state, () => samples.overflows.map(checkTextOverflow));
  runArray(state, () => samples.repeatedTexts.map(checkRepeatedText));
  runArray(state, () => samples.clippedOverflows.map(checkClippedOverflow));
  runArray(state, () => samples.edgeFlushCards.map(checkEdgeFlush));
  runArray(state, () => emptyStates.findings);
  // The #816 collision family: text erased to zero width. Legacy sample bundles may omit its walker
  // census; the collector still publishes a derived zero row so reports never confuse absence with an
  // unreported population contract.
  runArray(state, () => truncated.findings);
  runArray(state, () => overhangs.findings);
  runArray(state, () => paddingLeaks.findings);
  runArray(state, () => tierDrift.findings);
  return {
    ...state,
    populationAccounting: {
      "double-empty-state": emptyStates.accounting,
      "duplicate-action-door": duplicateDoors.accounting,
      "headline-overhang": overhangs.accounting,
      "inline-padding-leak": paddingLeaks.accounting,
      "tier-drift": tierDrift.accounting,
      "truncated-to-nothing": truncated.accounting,
    },
  };
}

function structureFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  runArray(state, () => nullableFindings(samples.zIndexes, checkZIndex));
  runArray(state, () => nullableFindings(samples.nestedCards, checkNestedCard));
  runArray(state, () => nullableFindings(samples.gradientTexts, checkGradientText));
  runArray(state, () => nullableFindings(samples.animatedImgHovers, checkAnimatedImgHover));
  const cohortAnatomy = cappedRelationalFindings(
    "cohort-anatomy",
    samples.cohortAnatomies ?? [],
    checkCohortAnatomy,
    samples.relationalAccounting?.["cohort-anatomy"],
  );
  const rowVoid = cappedRelationalFindings("row-void", samples.rowVoids ?? [], checkRowVoid, samples.relationalAccounting?.["row-void"]);
  const paneInk = cappedRelationalFindings("pane-ink", samples.paneInks ?? [], checkPaneInk, samples.relationalAccounting?.["pane-ink"]);
  const selection = accountedFindings("selection-idiom", samples.selectionIdioms ?? [], checkSelectionIdiom, {
    census: samples.relationalAccounting?.["selection-idiom"],
    samplesAreJudged: false,
  });
  runArray(state, () => cohortAnatomy.findings);
  runArray(state, () => rowVoid.findings);
  runArray(state, () => selection.findings);
  runArray(state, () => paneInk.findings);
  return {
    ...state,
    populationAccounting: {
      "cohort-anatomy": cohortAnatomy.accounting,
      "pane-ink": paneInk.accounting,
      "row-void": rowVoid.accounting,
      "selection-idiom": selection.accounting,
    },
  };
}

function typographyFindings(samples: RawSamples): FamilyCheckResult {
  const state = emptyFamilyResult();
  const styleFindings = new Map<(typeof samples.textStyles)[number], readonly Finding[]>();
  const ungrouped: Finding[] = [];
  for (const input of samples.textStyles) {
    const findings = checkTextStyle(input);
    styleFindings.set(input, findings);
    ungrouped.push(...findings.filter(({ rule }) => rule !== "text-below-ramp" && rule !== "undersized-ui-text"));
  }
  const decisionKey = (input: (typeof samples.textStyles)[number]): string =>
    `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}`;
  const textBelowRamp = decisionPopulationFindings(
    "text-below-ramp",
    samples.textStyles,
    (input) => styleFindings.get(input)?.find(({ rule }) => rule === "text-below-ramp") ?? null,
    { decisionKey, census: undefined },
  );
  const undersizedUiText = decisionPopulationFindings(
    "undersized-ui-text",
    samples.textStyles,
    (input) => styleFindings.get(input)?.find(({ rule }) => rule === "undersized-ui-text") ?? null,
    { decisionKey, census: undefined },
  );
  runArray(state, () => [...ungrouped, ...textBelowRamp.findings, ...undersizedUiText.findings]);
  runArray(state, () => checkCaveatHierarchy(samples.textStyles));
  runArray(state, () => checkFontCensus(samples.fontCensus));
  return {
    ...state,
    populationAccounting: { "text-below-ramp": textBelowRamp.accounting, "undersized-ui-text": undersizedUiText.accounting },
  };
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
  readonly populationAccounting: PopulationAccounting;
}

/** Runs every enabled family through the same dispatch that produces its population evidence. */
export function collectAudit(samples: RawSamples): AuditCollection {
  const findings: Finding[] = [];
  const familyScans = Object.fromEntries(DESIGN_AUDIT_RULE_FAMILIES.map((family) => [family, 0])) as Record<DesignAuditRuleFamily, number>;
  const populationAccounting: Partial<PopulationAccounting> = {};
  for (const family of DESIGN_AUDIT_RULE_FAMILIES) {
    const result = AUDIT_FAMILY_CHECKERS[family](samples);
    findings.push(...result.findings);
    familyScans[family] += result.scans;
    Object.assign(populationAccounting, result.populationAccounting);
  }
  return { findings, familyScans, populationAccounting };
}

export function collectFindings(samples: RawSamples): Finding[] {
  return [...collectAudit(samples).findings];
}
