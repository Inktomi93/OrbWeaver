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
import type { Finding, PopulationAccounting, RulePopulationAccounting } from "../contract/findings.ts";
import type { DesignAuditRuleFamily, DesignAuditRuleId } from "../contract/rules.ts";
import { DESIGN_AUDIT_RULE_FAMILIES } from "../contract/rules.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { RelationalCensusAccountingInput } from "../contract/samples-populations.ts";
import {
  checkAccessibleName,
  checkControlAspect,
  checkHeadingOrder,
  checkMainLandmark,
  checkObscuredTarget,
  checkTabIndexSmell,
  checkTapTargetPopulations,
} from "./checks-a11y.ts";
import { checkContrast, checkGrayOnColor, checkQuietState } from "./checks-color.ts";
import { checkAccentBorder, checkGlowShadow } from "./checks-decor.ts";
import { checkBrokenImage, checkImageDistortion } from "./checks-media.ts";
import { checkBgPattern, checkIconTile, checkMotionStatic, checkRadialGlow } from "./checks-ornament.ts";
import {
  checkClippedOverflow,
  checkDoubleEmptyState,
  checkDuplicateDoorPopulations,
  checkEdgeFlush,
  checkRepeatedText,
  checkTextOverflow,
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
import { checkCaveatHierarchy, checkFontCensus, groupTypeFindings } from "./checks-typography.ts";
import { assertCensusAccounting, assertRelationalCensus, settledPopulationAccounting } from "./population.ts";

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

const RELATIONAL_REPRESENTATIVE_CAPS = {
  "cohort-anatomy": 12,
  "pane-ink": 6,
  "row-void": 8,
} as const;

function cappedRelationalFindings<T>(
  rule: keyof typeof RELATIONAL_REPRESENTATIVE_CAPS,
  items: readonly T[],
  check: (item: T) => Finding | null,
  census: RelationalCensusAccountingInput | undefined,
): { readonly accounting: RulePopulationAccounting; readonly findings: readonly Finding[] } {
  if (census !== undefined) {
    assertRelationalCensus(rule, census, items.length);
  }
  const affected = nullableFindings(items, check);
  const cap = RELATIONAL_REPRESENTATIVE_CAPS[rule];
  const emitted = affected.slice(0, cap);
  const capWithheld = affected.length - emitted.length;
  const withheld = { ...(census?.withheld ?? {}) };
  if (capWithheld > 0) {
    withheld["cap"] = capWithheld;
  }
  return {
    findings: emitted,
    accounting: settledPopulationAccounting(rule, {
      candidates: census?.candidates ?? items.length,
      judged: census?.judged ?? items.length,
      affected: affected.length,
      populations: affected.length,
      emitted: emitted.length,
      withheld,
      excluded: { ...(census?.excluded ?? {}) },
      collapsed: {},
    }),
  };
}

function accountedFindings<T>(
  rule: DesignAuditRuleId,
  items: readonly T[],
  check: (item: T) => Finding | null,
  options: { readonly census: RelationalCensusAccountingInput | undefined; readonly samplesAreJudged: boolean },
): { readonly accounting: RulePopulationAccounting; readonly findings: readonly Finding[] } {
  const { census, samplesAreJudged } = options;
  if (census !== undefined) {
    if (samplesAreJudged) {
      assertRelationalCensus(rule, census, items.length);
    } else {
      assertCensusAccounting(rule, census);
    }
  }
  const findings = nullableFindings(items, check);
  return {
    findings,
    accounting: settledPopulationAccounting(rule, {
      candidates: census?.candidates ?? items.length,
      judged: census?.judged ?? items.length,
      affected: findings.length,
      populations: findings.length,
      emitted: findings.length,
      withheld: { ...(census?.withheld ?? {}) },
      excluded: { ...(census?.excluded ?? {}) },
      collapsed: {},
    }),
  };
}

const DECISION_REPRESENTATIVE_CAP = 5;

interface DecisionFindingRow<T> {
  readonly input: T;
  readonly finding: Finding;
}

function decisionPopulationFindings<T extends { readonly selector: string }>(
  rule: DesignAuditRuleId,
  items: readonly T[],
  check: (item: T) => Finding,
  options: { readonly census: RelationalCensusAccountingInput | undefined; readonly decisionKey: (item: T) => string },
): { readonly accounting: RulePopulationAccounting; readonly findings: readonly Finding[] } {
  const { census, decisionKey } = options;
  if (census !== undefined) {
    assertCensusAccounting(rule, census);
  }
  const groups = new Map<string, DecisionFindingRow<T>[]>();
  for (const input of items) {
    const key = decisionKey(input);
    const group = groups.get(key) ?? [];
    group.push({ input, finding: check(input) });
    groups.set(key, group);
  }
  const findings: Finding[] = [];
  let emitted = 0;
  for (const group of groups.values()) {
    const first = group[0];
    if (first === undefined) {
      continue;
    }
    const representatives = group.slice(0, DECISION_REPRESENTATIVE_CAP).map(({ input }) => input.selector);
    const capped = group.length - representatives.length;
    emitted += representatives.length;
    findings.push({
      ...first.finding,
      selector: representatives[0] ?? first.input.selector,
      value: `${first.finding.value}; ${String(group.length)} affected; ${String(representatives.length)} representative(s), ${String(capped)} capped`,
      representatives,
      population: { affected: group.length, judged: group.length, capped },
    } as Finding);
  }
  const cap = items.length - emitted;
  const withheld = { ...(census?.withheld ?? {}) };
  if (cap > 0) {
    withheld["cap"] = cap;
  }
  return {
    findings,
    accounting: settledPopulationAccounting(rule, {
      candidates: census?.candidates ?? items.length,
      judged: census?.judged ?? items.length,
      affected: items.length,
      populations: findings.length,
      emitted,
      withheld,
      excluded: { ...(census?.excluded ?? {}) },
      collapsed: {},
    }),
  };
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
  runArray(state, () => nullableFindings(samples.texts, checkContrast));
  runArray(state, () => nullableFindings(samples.texts, checkGrayOnColor));
  runArray(state, () => quiet.findings);
  return { ...state, populationAccounting: { "quiet-state": quiet.accounting } };
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
  const duplicateDoors = checkDuplicateDoorPopulations(samples.actionDoors ?? []);
  const emptyStates = accountedFindings("double-empty-state", samples.emptyStates ?? [], checkDoubleEmptyState, {
    census: samples.relationalAccounting?.["double-empty-state"],
    samplesAreJudged: true,
  });
  const truncated = decisionPopulationFindings("truncated-to-nothing", samples.truncatedTexts ?? [], checkTruncatedText, {
    decisionKey: (input) => `${input.authoredTarget ?? input.selector}\u0000${input.authoredHome ?? input.selector}`,
    census: samples.relationalAccounting?.["truncated-to-nothing"],
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
  return {
    ...state,
    populationAccounting: {
      "double-empty-state": emptyStates.accounting,
      "duplicate-action-door": duplicateDoors.accounting,
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
  // groupTypeFindings runs the SAME per-element checks and then folds only the two size floors by
  // authored decision (#983's contract, extended to type — see checks-typography.ts). Every other
  // typography rule passes through per-element, which is correct: they judge this node's own copy.
  runArray(state, () => groupTypeFindings(samples.textStyles));
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
