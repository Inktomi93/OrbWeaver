// What a finished report says. Zero killed gets its own exit: a sandbox that escaped to unmutated code and a
// file whose tests catch nothing look identical from here, and neither may read as a clean run.
import { EXIT } from "../../floor/cli/exit-contract.ts";
import type { MutantStatus, ReportMutant } from "../../mutation-arid/index.ts";
import { MUTANT_STATUSES } from "../../mutation-arid/index.ts";

export type StatusCounts = Readonly<Record<MutantStatus, number>>;

export function countStatuses(mutants: readonly ReportMutant[]): StatusCounts {
  const counts = Object.fromEntries(MUTANT_STATUSES.map((status) => [status, 0])) as Record<MutantStatus, number>;
  for (const { status } of mutants) {
    counts[status] += 1;
  }
  return counts;
}

/** Mutants a test actually ran against. Ignored and compile-error mutants never reached one. */
export function testedCount(counts: StatusCounts): number {
  return counts.Killed + counts.Timeout + counts.Survived + counts.NoCoverage + counts.RuntimeError;
}

export const SURVIVOR_NOTE =
  "Only the mirrored tests ran. A survivor may die to a test elsewhere: rerun with --tests <file-or-glob...>, which replaces the mirror.";

export const ZERO_KILLED_READINGS = [
  "ZERO KILLED. Two readings, and this run cannot tell them apart:",
  "  1. The tests catch nothing in this file. The survivors above are the finding.",
  "  2. The sandbox ran unmutated code. Check it by breaking the file by hand and running its test.",
] as const;

export function exitForCounts(counts: StatusCounts): number {
  return counts.Killed + counts.Timeout === 0 ? EXIT.violations : EXIT.clean;
}
