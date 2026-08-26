// mutation-probe's wire shapes. A receipt is one PLANTED mutant's verdict: the suite either went red
// (killed) or did not (a real survivor), plus the NAMED tests that did the killing — the attribution
// Stryker's perTest coverage cannot give, because it credits module-load-scope mutants to whichever
// unrelated test loaded the module first.

/** The report statuses worth PLANTING. `Survived`: the report claims tests ran and none caught it.
 *  `NoCoverage`: the report claims no test runs the line — a kill there refutes the coverage attribution
 *  itself, which makes every score over that file suspect. */
export const PLANTABLE_STATUSES = ["Survived", "NoCoverage"] as const;
export type PlantableStatus = (typeof PLANTABLE_STATUSES)[number];

/** Which report population the mutant came from — a kill means something different for each. */
export const MUTANT_POPULATIONS = ["survived", "no-coverage"] as const;
export type MutantPopulation = (typeof MUTANT_POPULATIONS)[number];

/** What a suite exit means for the mutant that was planted. `unmeasured` is the timeout arm: spawnSync
 *  reports a wall-clock-killed child as `status: null`, and scoring that as a kill would hide a real
 *  survivor behind a confident verdict. */
export const SUITE_VERDICTS = ["killed", "survived", "unmeasured"] as const;
export type SuiteVerdict = (typeof SUITE_VERDICTS)[number];

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
  /** The mirror suite went red with this mutant planted. Never true for a timed-out run. */
  readonly killed: boolean;
  /** The suite was KILLED by the wall-clock ceiling (status null) rather than returning a verdict — an
   *  infinite-loop mutant is the standing cause. Neither a kill nor a survival: an unmeasured mutant. */
  readonly timedOut: boolean;
  /** Titles of the tests that failed. Empty when the suite stayed green. */
  readonly failedTests: readonly string[];
  /** The suite went red but its json report was unreadable, so the kill could not be attributed. The
   *  verdict still stands (it comes from the exit code) — but a silent empty `failedTests` would read
   *  as "killed by nothing", so the ambiguity is named rather than hidden. */
  readonly attributionMissing: boolean;
}

/** The adjudication of one report file's survivor set over a probed range. */
export interface ProbeSummary {
  readonly sourceRel: string;
  readonly specs: readonly string[];
  readonly reportedSurvivors: number;
  readonly reportedNoCoverage: number;
  readonly measured: number;
  readonly killed: number;
  readonly stillSurvived: number;
  readonly timedOut: number;
  readonly noopReplacements: number;
  /** Planted NoCoverage mutants the suite actually KILLED. Each one refutes the report's coverage
   *  attribution, which makes every score over this file suspect — a louder finding than a survivor. */
  readonly falselyUncovered: number;
  readonly receiptsPath: string;
  readonly receipts: readonly MutantReceipt[];
}
