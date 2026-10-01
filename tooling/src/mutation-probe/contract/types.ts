// mutation-probe's wire shapes distinguish measured test outcomes from failed measurement.

/** The report statuses worth PLANTING. `Survived`: the report claims tests ran and none caught it.
 *  `NoCoverage`: the report claims no test runs the line — a kill there refutes the coverage attribution
 *  itself, which makes every score over that file suspect. */
export const PLANTABLE_STATUSES = ["Survived", "NoCoverage"] as const;
export type PlantableStatus = (typeof PLANTABLE_STATUSES)[number];

/** Which report population the mutant came from — a kill means something different for each. */
export const MUTANT_POPULATIONS = ["survived", "no-coverage"] as const;
export type MutantPopulation = (typeof MUTANT_POPULATIONS)[number];

/** A completed, attributed suite verdict, or an explicit refusal to classify the run. */
export const SUITE_VERDICTS = ["killed", "survived", "unmeasured"] as const;
export type SuiteVerdict = (typeof SUITE_VERDICTS)[number];

/** Evidence validated against this runner invocation and its complete mirror selection. */
export type SuiteEvidence =
  | { readonly complete: false; readonly failedTests: readonly string[]; readonly attributionMissing: true }
  | { readonly complete: true; readonly failedTests: readonly string[]; readonly attributionMissing: false };

/** The suite report and invocation window whose assertions are being classified. */
export interface SuiteReportRequest {
  readonly root: string;
  readonly specs: readonly string[];
  readonly path: string;
  readonly startedAt: number;
  readonly finishedAt: number;
}

/** One planted mutant's measured outcome. */
export interface MutantReceipt {
  /** The status the report assigned before planting. */
  readonly population: MutantPopulation;
  /** Index within the report's survivor list for this file, sorted by location. */
  readonly index: number;
  readonly line: number;
  readonly column: number;
  readonly mutator: string;
  /** The replacement was byte-identical to the source — a report artifact, never a real survivor. */
  readonly noop: boolean;
  /** A completed mirror report attributes a failure to named tests with this mutant planted. */
  readonly killed: boolean;
  /** The runner reports ETIMEDOUT rather than a test verdict. */
  readonly timedOut: boolean;
  /** No complete attributed test verdict; neither killed nor survived. Includes timeouts. */
  readonly unmeasured: boolean;
  /** Titles of the tests that failed. Empty when the suite stayed green. */
  readonly failedTests: readonly string[];
  /** The report could not establish complete, current attribution. A kill never uses missing evidence. */
  readonly attributionMissing: boolean;
}

/** The adjudication of one report file's survivor set over a probed range. */
export interface ProbeSummary {
  readonly sourceRel: string;
  readonly specs: readonly string[];
  readonly reportedSurvivors: number;
  readonly reportedNoCoverage: number;
  /** Every mutant the report holds for this file, whatever its status. Printed because a Stryker report
   *  carries NO completeness marker: a run killed mid-flight writes a PARTIAL report that simply OMITS
   *  mutants rather than marking them pending, so a truncated population is byte-indistinguishable from a
   *  complete one. Measured 2026-08-27: an interrupted gate run left assemble.ts holding 38 mutants where a
   *  complete run holds 518, and none of this tool's refusals could tell. Surfacing the count lets a reader
   *  compare against the population the gate config's calibration comment records (1,129 instrumented /
   *  622 scored) and catch the truncation the JSON cannot declare. */
  readonly reportedTotal: number;
  /** Receipts with complete test verdicts; attempted but unmeasured mutations remain in receipts. */
  readonly measured: number;
  readonly killed: number;
  readonly stillSurvived: number;
  readonly timedOut: number;
  readonly unmeasured: number;
  readonly noopReplacements: number;
  /** Planted NoCoverage mutants the suite actually KILLED. Each one refutes the report's coverage
   *  attribution, which makes every score over this file suspect — a louder finding than a survivor. */
  readonly falselyUncovered: number;
  readonly receiptsPath: string;
  readonly receipts: readonly MutantReceipt[];
}
