// The failure ledger: per-outcome totals, evidence failure counts, and the ONE summary whose any-non-
// zero member reddens the exit — snap is CI-usable because this is exhaustive, not vibes.
import type { CapturedConsole } from "../../_shared/browser-capture.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ArmFailureCounts } from "../contract/arms.ts";
import type { CaptureOutcome } from "../contract/types.ts";
import type { SnapFailureSummary } from "../contract/verdict.ts";
import { consoleFailureCounts } from "./noise.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

export function hasSnapFailure(summary: SnapFailureSummary): boolean {
  return Object.values(summary).some((count) => count > 0);
}

/** THE NON-ARM TOTALS. Everything an ARM owns (aria/map/eval/contrast/assertion/dead-css counts) moved to
 *  the arm that measures it and reaches the summary through `arms` below; what is left here is the run's
 *  own drive accounting, which belongs to no arm. */
interface OutcomeTotals {
  readonly navigation: number;
  readonly navActions: number;
  readonly steps: number;
}

export function outcomeTotals(outcomes: readonly CaptureOutcome[]): OutcomeTotals {
  return {
    navigation: outcomes.filter((outcome) => outcome.navError !== null).length,
    navActions: outcomes.reduce((count, outcome) => count + outcome.navFailures, 0),
    steps: outcomes.reduce((count, outcome) => count + outcome.stepFailures, 0),
  };
}

/** Read one arm-owned member of the summary, LOUDLY. An arm that stops folding a field it owns is an
 *  instrument defect, and a silent 0 would report it as a clean run. */
function armCount(arms: ArmFailureCounts, field: keyof SnapFailureSummary): number {
  const count = arms[field];
  if (count === undefined) {
    throw new Error(`INSTRUMENT ERROR: no arm produced the verdict member "${field}" (tooling/src/snap/contract/arms.ts)`);
  }
  return count;
}

interface FailureSummaryInput {
  readonly outcomes: readonly CaptureOutcome[];
  readonly pageErrors: number;
  readonly failedRequests: number;
  readonly consoleMessages: readonly CapturedConsole[];
  readonly strictConsole: boolean;
  readonly watch?: number;
  readonly diff?: number;
  readonly environment?: number;
  readonly appearance?: number;
  /** Every arm-owned member, folded from the arms that measured them (contract/arms.ts `failures`). */
  readonly arms: ArmFailureCounts;
}

export function buildFailureSummary(input: FailureSummaryInput): SnapFailureSummary {
  const totals = outcomeTotals(input.outcomes);
  const console = consoleFailureCounts(input.consoleMessages, input.strictConsole);
  return {
    navigation: totals.navigation,
    navActions: totals.navActions,
    pageErrors: input.pageErrors,
    failedRequests: input.failedRequests,
    steps: totals.steps,
    contrast: armCount(input.arms, "contrast"),
    aria: armCount(input.arms, "aria"),
    map: armCount(input.arms, "map"),
    eval: armCount(input.arms, "eval"),
    watch: input.watch ?? 0,
    diff: input.diff ?? 0,
    assertions: armCount(input.arms, "assertions"),
    consoleErrors: console.errors,
    consoleWarnings: console.warnings,
    // THE ONE CROSS-ARM MEMBER, and the reason it is not an arm's: it counts OUTCOMES whose CSS evidence is
    // untrustworthy for EITHER reason — a cascade instrument-error or an unreadable stylesheet — and one
    // page can carry both. Two arms each contributing a count would double-count that page, so the fold
    // happens here, where both sheets of evidence for one page are visible.
    css: input.outcomes.filter((outcome) => outcome.cssEvidence?.status === "instrument-error" || (outcome.deadCssEvidence?.unreadable.length ?? 0) > 0).length,
    deadCss: armCount(input.arms, "deadCss"),
    emptyCss: armCount(input.arms, "emptyCss"),
    environment: input.environment ?? 0,
    appearance: input.appearance ?? 0,
    lighthouse: armCount(input.arms, "lighthouse"),
  };
}
