// The budget verdicts over the in-page motion snapshot — pure, unit-tested without a browser
// (tests/tooling/motion-audit/index.test.ts). CLS gates on the NON-virtualized total (issue #109);
// LoAF gets the sealed-Select first-entrance allowance with app/unrelated script-attribution vetoes.
import type { ClsBudgetBasis, LoafRecord, MotionSnapshot } from "../contract/types.ts";

// The budget thresholds (documented in cli.ts's header). ms unless noted.
const BLOCKING_BUDGET_MS = 50;
// Clean-host 4x-CPU first Select opens peaked at 181ms blocking: 131ms above the unchanged budget.
// Round to a stable 140ms first-only library allowance; repeats receive ZERO allowance.
const FIRST_SELECT_BLOCKING_ALLOWANCE_MS = 140;
export const CLS_BUDGET = 0.1;
export const DROPPED_FRAME_BUDGET_PCT = 5;
/** Percentage-point base — one place, so the floor below and the report's per-frame weight agree. */
export const PERCENT = 100;

/** THE FRAME-POPULATION RESOLUTION FLOOR (#1127 I3) — DERIVED from the budget above, never a chosen
 *  number: at `total` frames one dropped frame is worth `100/total` percentage points, so below
 *  `100 / DROPPED_FRAME_BUDGET_PCT` frames a SINGLE frame already exceeds the entire budget and the
 *  percentage stops separating "this surface drops frames" from "one frame slipped".
 *
 *  It exists because the % is a DENOMINATOR ARTEFACT on any suppressed-motion cell, measured on the live
 *  app 2026-09-02 (`--matrix`, side-eye retraction R-2): v02 `appReducedMotion` read `30.77% of 13` and
 *  v03 `osReducedMotion` `36.36% of 11`, against full-motion twins at `5.45% of 55` and `3.39% of 59`.
 *  The motion is suppressed BY DESIGN there, so the population collapses and four slow frames become a
 *  third of the run — a reader who saw only the percentages filed a P1 that the twins refuted. The twin
 *  machinery caught it; a lone cell has no twin, so the collapse is stated on the cell's own line. */
export const FRAME_POPULATION_RESOLUTION_FLOOR = Math.ceil(PERCENT / DROPPED_FRAME_BUDGET_PCT);
/** A rate needs two observations to be a rate. Below this the % is not small — it does not exist. */
export const RATE_MINIMUM_POPULATION = 2;

/** How much this run's frame population can support. `uncomputable` — a rate needs two frames to be a
 *  rate at all, so `0% of 1` is a smoothness claim over nothing; `collapsed` — computable but below the
 *  resolution floor, so the number is real and the VERDICT it looks like is not; `verdict` — the
 *  ordinary case. `total === 0` never reaches here: it is already a hard evidence gap (lib/evidence.ts). */
export function framePopulationBasis(total: number): "uncomputable" | "collapsed" | "verdict" {
  if (total < RATE_MINIMUM_POPULATION) {
    return "uncomputable";
  }
  return total < FRAME_POPULATION_RESOLUTION_FLOOR ? "collapsed" : "verdict";
}

const RELATED_REACT_SCRIPT_PATH = /\/node_modules\/(?:\.vite\/deps\/)?react(?:-dom)?(?:[./_-]|$)/u;

/** The three CLS numbers a report must show. Split from `report` so the verdict rule is unit-testable
 *  (tests/tooling/motion-audit.test.ts) without a browser: a synthetic virtualized shift must move `raw`
 *  and leave `budgeted` alone. A snapshot from a bridge that predates the split (`undefined` fields) is
 *  read as "nothing classified virtualized", i.e. the pre-#109 behavior — never as a free pass. */
export function clsTotals(motion: MotionSnapshot | null): { raw: number; virtualized: number; budgeted: number } {
  if (motion === null) {
    return { raw: 0, virtualized: 0, budgeted: 0 };
  }
  const virtualized = motion.virtualizedCls ?? 0;
  return { raw: motion.cls, virtualized, budgeted: motion.nonVirtualizedCls ?? motion.cls - virtualized };
}

/** The OBSERVED halves — every shift, input-adjacent included, with the same #109 virtual-row split.
 *  `null` ⇔ the served bundle predates #1071 and cannot answer. There is deliberately NO fallback to the
 *  spec totals: on an interaction window that fallback IS the #1071 false PASS. */
export function observedClsTotals(motion: MotionSnapshot | null): { raw: number; virtualized: number; budgeted: number } | null {
  if (motion === null || motion.observedCls === undefined) {
    return null;
  }
  const virtualized = motion.observedVirtualizedCls ?? 0;
  return {
    raw: motion.observedCls,
    virtualized,
    budgeted: motion.observedNonVirtualizedCls ?? motion.observedCls - virtualized,
  };
}

/** Which CLS total this run's budget is entitled to judge.
 *
 *  ENTRY / navigation windows keep `nonVirtualizedCls` (#109) — no trusted input happened, so the spec
 *  metric excluded nothing and its polarity is correct (verified in the #1065 mechanism audit, §2 row 5;
 *  the dev-bridge nav sets only the console-mute flag, never `hadRecentInput`).
 *
 *  INTERACTION windows must judge `observedNonVirtualizedCls` (#1071). motion-audit's measured click is a
 *  REAL CDP dispatch, so Chrome excluded every shift within 500ms of it from `cls` — i.e. from the only
 *  number the tool printed or gated. The collector's own header records the receipt that paid for this:
 *  0.207 of observed instability on the docked panel toggle, `cls` 0.0177, budget PASS while the shell
 *  visibly thrashed.
 *
 *  `basis` is reported, never inferred by a reader: which number was judged is part of the verdict. */
export function clsBudgetBasis(measuredInput: boolean): ClsBudgetBasis {
  return measuredInput ? "observed-non-virtualized" : "non-virtualized";
}

/** THE CLS VERDICT. The judged total is chosen by `clsBudgetBasis`; a `null` here means the run measured
 *  a trusted input against a bundle that cannot report the observed total, which is an EVIDENCE GAP, not
 *  a pass (`lib/evidence.ts` `observedClsGap` owns the consequence). */
export function clsBudgeted(motion: MotionSnapshot | null, measuredInput: boolean): number | null {
  if (!measuredInput) {
    return clsTotals(motion).budgeted;
  }
  const observed = observedClsTotals(motion);
  return observed === null ? null : observed.budgeted;
}

export function clsOverBudget(motion: MotionSnapshot | null, measuredInput: boolean): boolean {
  const budgeted = clsBudgeted(motion, measuredInput);
  return budgeted !== null && budgeted > CLS_BUDGET;
}

export function confirmedSelectEntrance(loaf: LoafRecord): NonNullable<LoafRecord["selectEntrance"]> | undefined {
  const entrance = loaf.selectEntrance;
  return entrance?.confirmedAt === undefined ? undefined : entrance;
}

const SCRIPT_ATTRIBUTIONS = ["related", "unrelated", "unknown"] as const;
type ScriptAttribution = (typeof SCRIPT_ATTRIBUTIONS)[number];

/** LoAF script URLs are a veto, not proof of ownership. Dev URLs retain module identity; production
 * hashed bundles and empty/inline attribution do not, so treating either as app or library would lie. */
function scriptAttribution(sourceURL: string): ScriptAttribution {
  if (sourceURL === "" || sourceURL === "(inline)") {
    return "unknown";
  }
  let pathname: string;
  // @orb-gate-ignore caught-failure-ownership(empty:catch): an unparseable sourceURL falls back to the raw string, which the pathname.includes() checks below just won't match — degrading to "unknown" attribution rather than throwing, consistent with this function's documented "veto, not proof" contract. Ends if callers start requiring pathname to be a real URL path.
  try {
    pathname = new URL(sourceURL).pathname;
  } catch {
    pathname = sourceURL;
  }
  if (pathname.includes("@base-ui") || pathname.includes("@floating-ui") || RELATED_REACT_SCRIPT_PATH.test(pathname)) {
    return "related";
  }
  if (
    pathname.includes("/packages/") ||
    pathname.includes("/src/") ||
    pathname.includes("/scripts/") ||
    pathname.includes("/tests/") ||
    pathname.includes("/node_modules/")
  ) {
    return "unrelated";
  }
  return "unknown";
}

export function hasUnrelatedScriptAttribution(loaf: LoafRecord): boolean {
  return loaf.scripts.some((script) => scriptAttribution(script.sourceURL) === "unrelated");
}

function containsConfirmation(loaf: LoafRecord, entrance: NonNullable<LoafRecord["selectEntrance"]>): boolean {
  const confirmedAt = entrance.confirmedAt;
  return confirmedAt !== undefined && loaf.startTime <= confirmedAt && loaf.startTime + loaf.duration >= confirmedAt;
}

/** One first entrance can overlap multiple LoAFs. Choose one primary confirmation frame before applying
 * attribution vetoes so an app-owned primary cannot move the fixed allowance onto a later frame. */
function primaryFirstLoafIndexes(loafs: readonly LoafRecord[]): ReadonlySet<number> {
  const primaryByEntrance = new Map<number, number>();
  for (const [index, loaf] of loafs.entries()) {
    const entrance = confirmedSelectEntrance(loaf);
    if (entrance?.firstForTrigger !== true) {
      continue;
    }
    const priorIndex = primaryByEntrance.get(entrance.id);
    if (priorIndex === undefined) {
      primaryByEntrance.set(entrance.id, index);
      continue;
    }
    const priorLoaf = loafs[priorIndex];
    if (priorLoaf === undefined) {
      continue;
    }
    const priorEntrance = confirmedSelectEntrance(priorLoaf);
    if (priorEntrance === undefined) {
      continue;
    }
    const candidateContainsConfirmation = containsConfirmation(loaf, entrance);
    const priorContainsConfirmation = containsConfirmation(priorLoaf, priorEntrance);
    if (
      (candidateContainsConfirmation && !priorContainsConfirmation) ||
      (candidateContainsConfirmation === priorContainsConfirmation && loaf.startTime < priorLoaf.startTime)
    ) {
      primaryByEntrance.set(entrance.id, index);
    }
  }
  return new Set(primaryByEntrance.values());
}

/** Raw/classified/budgeted LoAF inputs. The budget itself is unchanged: confirmed sealed-Select
 * entrance frames may carry their measured positioning style work; only the trigger's first page-
 * lifetime entrance receives the fixed blocking subtraction. Repeats and all unclassified work face
 * the ordinary 50ms blocking budget. */
export function loafTotals(motion: MotionSnapshot | null): {
  rawWorstBlocking: number;
  classifiedInitializations: number;
  budgetedWorstBlocking: number;
  budgetedStyleLayout: number;
} {
  const loafs = motion?.loafs ?? [];
  const primaryIndexes = primaryFirstLoafIndexes(loafs);
  const eligiblePrimaryIndexes = new Set(
    [...primaryIndexes].filter((index) => {
      const loaf = loafs[index];
      return loaf !== undefined && !hasUnrelatedScriptAttribution(loaf);
    }),
  );
  return {
    rawWorstBlocking: loafs.reduce((worst, loaf) => Math.max(worst, loaf.blockingDuration), 0),
    classifiedInitializations: eligiblePrimaryIndexes.size,
    budgetedWorstBlocking: loafs.reduce((worst, loaf, index) => {
      const allowance = eligiblePrimaryIndexes.has(index) ? FIRST_SELECT_BLOCKING_ALLOWANCE_MS : 0;
      return Math.max(worst, Math.max(0, loaf.blockingDuration - allowance));
    }, 0),
    budgetedStyleLayout: loafs.filter(
      (loaf) => loaf.styleAndLayoutStart > 0 && (confirmedSelectEntrance(loaf) === undefined || hasUnrelatedScriptAttribution(loaf)),
    ).length,
  };
}

export function loafOverBudget(motion: MotionSnapshot | null): boolean {
  const totals = loafTotals(motion);
  return totals.budgetedStyleLayout > 0 || totals.budgetedWorstBlocking > BLOCKING_BUDGET_MS;
}
