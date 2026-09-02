// The SHAPES of one component-test run — the outcome axis plus the facts the CT summary, the flake
// artifact and the unfed-read ratchet are all rendered from. Homed here (the verify tool's contract slot,
// Core-Tooling-Law.md §2.5) rather than beside the judge in `ops/ct-run-tally.ts`, which is where the
// `no-inline-types` gate puts an exported shape a tool's ops would otherwise own.
//
// `CtSuiteFacts`/`CtTestFacts` are the minimal STRUCTURAL slice of Playwright's `Suite`/`TestCase` the
// tally reads — deliberately not the vendor types, so the real reporter passes the real suite and the pin
// (tests/tooling/verify/ops/ct-run-tally.test.ts) passes a synthetic one with no Playwright runtime.

/** Playwright's four terminal outcomes, in its own spelling (`TestCase.outcome()`) — the axis declared ONCE
 *  as a tuple so the tally's bucket map is a mapped Record over it and a fifth outcome fails `tsc` rather
 *  than falling into an untallied hole. */
export const CT_OUTCOMES = ["expected", "unexpected", "flaky", "skipped"] as const;
export type CtOutcome = (typeof CT_OUTCOMES)[number];

/** The minimal structural slice of Playwright's `TestCase` the tally reads. */
export interface CtTestFacts {
  readonly location: { readonly file: string; readonly line: number; readonly column: number };
  readonly outcome: () => CtOutcome;
  readonly titlePath: () => readonly string[];
  /** One entry per ATTEMPT; `workerIndex` is carried so a fixture can span workers the way a real run does. */
  readonly results: readonly { readonly workerIndex: number }[];
}

/** The minimal structural slice of Playwright's root `Suite`. */
export interface CtSuiteFacts {
  readonly allTests: () => readonly CtTestFacts[];
}

/** A retry-masked pass: failed, then passed on a later attempt. */
export interface CtFlakyTest {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly title: string;
  readonly titlePath: readonly string[];
  readonly retries: number;
}

/** A hard failure — `unexpected`, i.e. still failing after every retry. */
export interface CtFailedTest {
  readonly file: string;
  readonly line: number;
  readonly title: string;
}

export interface CtRunTally {
  readonly passed: number;
  readonly failed: number;
  readonly flaky: number;
  readonly skipped: number;
}

/** Everything the summary block and the flake artifact are rendered from, read once off the suite. */
export interface CtRunFacts {
  readonly tally: CtRunTally;
  readonly failed: readonly CtFailedTest[];
  readonly flaky: readonly CtFlakyTest[];
  /** Repo-relative paths of the files this run actually EXECUTED (a skipped test observed nothing). */
  readonly executedFiles: readonly string[];
}

/** One CT that DECLINED TO VOTE because the box was too loaded for its measured rate to mean anything
 *  (#1232 section 7.1, `annotateRateWithhold`). Not a flake and not a failure — a third outcome the
 *  reporter names out loud so a green bar with a missing arm is never mistaken for a full run. */
export interface CtWithheldTest {
  readonly file: string;
  readonly title: string;
  /** The withhold reason, carrying the loadavg receipt. */
  readonly reason: string;
}
