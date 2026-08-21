// The budget verdicts over the in-page motion snapshot — pure, unit-tested without a browser
// (tests/tooling/motion-audit/index.test.ts). CLS gates on the NON-virtualized total (issue #109);
// LoAF gets the sealed-Select first-entrance allowance with app/unrelated script-attribution vetoes.
import type { LoafRecord, MotionSnapshot } from "../contract/types.ts";

// The budget thresholds (documented in cli.ts's header). ms unless noted.
const BLOCKING_BUDGET_MS = 50;
// Clean-host 4x-CPU first Select opens peaked at 181ms blocking: 131ms above the unchanged budget.
// Round to a stable 140ms first-only library allowance; repeats receive ZERO allowance.
const FIRST_SELECT_BLOCKING_ALLOWANCE_MS = 140;
export const CLS_BUDGET = 0.1;
export const DROPPED_FRAME_BUDGET_PCT = 5;
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

/** THE CLS VERDICT (issue #109): the budget judges the NON-virtualized total only. A shift the in-page
 *  instrument tagged `virtualized` moves `raw` and must never move this. */
export function clsOverBudget(motion: MotionSnapshot | null): boolean {
  return clsTotals(motion).budgeted > CLS_BUDGET;
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
