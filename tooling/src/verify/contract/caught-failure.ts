// The shape of the caught-failure ownership CENSUS (issue #751) — the durable review record at
// docs/reviews/caught-failure-ownership/population.json. Homed in contract/ because two modules read it:
// the generator that derives it (ops/gen/caught-failure-population.ts) and the permanent pin that compares
// the committed file against a fresh derivation. The census is EVIDENCE, not a ledger: no gate reads it and
// it suppresses nothing.

/** How a site's failure is owned TODAY. ONE tuple, so a fourth verdict is a row here and `tsc` finds every
 *  reader — never an inline re-spelling of the members (Spine-TypeScript-and-Patterns.md §7.5). */
export const CAUGHT_FAILURE_VERDICTS = ["deliberate-absorb", "detached-owned", "unproven"] as const;
export type CaughtFailureVerdict = (typeof CAUGHT_FAILURE_VERDICTS)[number];

export interface CaughtFailureRow {
  /** Stable across line moves: path + reported position + the nth occurrence of that pair in the file. */
  readonly siteId: string;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  /** `promise` | `empty` | `default` — the detector arm. */
  readonly grammar: string;
  /** The exact token the finding reports and a marker must name. */
  readonly position: string;
  /** Multiplicity: the 1-based occurrence of (path, position) in file order. */
  readonly ordinal: number;
  readonly snippet: string;
  readonly verdict: CaughtFailureVerdict;
  /** The FULL adjacent reason, verbatim — null for `unproven`, and for `detached-owned` (whose reason lives
   *  in its `@swallowed-ok` marker, two-sided by `detached-work-traced`). */
  readonly reason: string | null;
  readonly markerLine: number | null;
}

export interface CaughtFailureTotals {
  readonly sites: number;
  readonly enforced: number;
  readonly reported: number;
  readonly byVerdict: Readonly<Record<CaughtFailureVerdict, number>>;
  readonly byGrammar: Readonly<Record<string, number>>;
}

export interface CaughtFailurePopulation {
  readonly gate: string;
  readonly generatedBy: string;
  readonly totals: CaughtFailureTotals;
  readonly rows: readonly CaughtFailureRow[];
}
