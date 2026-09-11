// The shape of the caught-failure ownership CENSUS (issue #751) — the durable review record at
// docs/reviews/caught-failure-ownership/population.json. Homed in contract/ because two modules read it:
// the generator that derives it (ops/gen/caught-failure-population.ts) and the permanent pin that compares
// the committed file against a fresh derivation. The census is EVIDENCE, not a ledger: no gate reads it and
// it suppresses nothing.

/** How a site's failure is owned TODAY. ONE tuple, so a third verdict is a row here and `tsc` finds every
 *  reader — never an inline re-spelling of the members (Spine-TypeScript-and-Patterns.md §7.5).
 *
 *  `detached-owned` was RETIRED with the #1584 conversion: it meant "a live `@swallowed-ok` marker owned by
 *  `detached-work-traced` already proves this site", and that cross-gate acceptance arm is gone (§12.5 bans
 *  a gate-specific exemption grammar; the reasons are in the policy header). Those sites now carry their own
 *  `@orb-waive` marker and are ordinary `deliberate-absorb` rows. A framework-owned site is no longer a row
 *  at all, which is what every other OWNED site already was — the old `enforced` total existed only to carry
 *  that asymmetry. */
export const CAUGHT_FAILURE_VERDICTS = ["deliberate-absorb", "unproven"] as const;
export type CaughtFailureVerdict = (typeof CAUGHT_FAILURE_VERDICTS)[number];

export interface CaughtFailureRow {
  /** Stable across line moves: path + reported position + the nth occurrence of that pair in the file. */
  readonly siteId: string;
  readonly path: string;
  readonly line: number;
  readonly column: number;
  /** `promise` | `empty` | `default` — the detector arm (`CaughtFailureArm` in lib/caught-failure.ts). */
  readonly grammar: string;
  /** The exact token the finding reports and a marker must name. */
  readonly position: string;
  /** Multiplicity: the 1-based occurrence of (path, position) in file order. */
  readonly ordinal: number;
  readonly snippet: string;
  readonly verdict: CaughtFailureVerdict;
  /** The FULL reason out of the `@orb-waive` marker the central engine bound to this site, verbatim — null
   *  for `unproven`. */
  readonly reason: string | null;
  readonly markerLine: number | null;
}

export interface CaughtFailureTotals {
  readonly sites: number;
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
