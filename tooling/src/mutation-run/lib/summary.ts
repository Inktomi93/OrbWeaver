// What a finished report says. Zero killed gets its own exit: a sandbox that escaped to unmutated code and a
// file whose every mutant survives look identical from here, and neither may read as a clean run.
import { EXIT } from "../../floor/cli/exit-contract.ts";
import type { MutantStatus, ReportMutant } from "../../mutation-arid/index.ts";
import { MUTANT_STATUSES } from "../../mutation-arid/index.ts";

const NOT_MEASURED = "NotMeasured";

/** Stryker's statuses plus {@link NOT_MEASURED}: a Survived mutant whose run completed no test, which is no evidence either way. */
export type StatusCounts = Readonly<Record<MutantStatus | typeof NOT_MEASURED, number>>;

export function countStatuses(mutants: readonly ReportMutant[]): StatusCounts {
  const counts = { ...(Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0])) as Record<MutantStatus, number>), [NOT_MEASURED]: 0 };
  for (const { status, testsCompleted } of mutants) {
    counts[status === "Survived" && testsCompleted === 0 ? NOT_MEASURED : status] += 1;
  }
  return counts;
}

/** Mutants a test actually ran against. Ignored, compile-error and not-measured mutants never reached one. */
export function testedCount(counts: StatusCounts): number {
  return counts.Killed + counts.Timeout + counts.Survived + counts.NoCoverage + counts.RuntimeError;
}

export const SURVIVOR_NOTE =
  "Only the mirrored tests ran. A survivor, or a NoCoverage mutant whose test lives outside the mirror, may die to another test: rerun with --tests <file-or-glob...>, which replaces the mirror.";

export const NOT_MEASURED_NOTE = "NOT MEASURED. Stryker scored these Survived, but their runs completed no test, so they say nothing about the tests. Rerun.";

export const ZERO_KILLED_READINGS = [
  "ZERO KILLED. Two readings, and this run cannot tell them apart:",
  "  1. The tests catch nothing in this file. The survivors above are the finding.",
  "  2. The sandbox ran unmutated code. Check it by breaking the file by hand and running its test.",
] as const;

export function exitForCounts(counts: StatusCounts): number {
  if (counts.NotMeasured > 0) {
    return EXIT.toolError;
  }
  return counts.Killed + counts.Timeout === 0 ? EXIT.violations : EXIT.clean;
}
