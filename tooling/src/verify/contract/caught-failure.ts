// The shape of the caught-failure ownership CENSUS (issue #751) — the durable review record at
// tooling/src/verify/gates/caught-failure-ownership.population.json, beside the policies that read it. Homed in
// contract/ because three modules read it: the generator that derives it (ops/gen/caught-failure-population.ts),
// the `ledgers:fresh` comparator, and the permanent pin that compares the committed file against a fresh
// derivation. The census suppresses nothing: `caught-failure-ownership-health` joins it to the tree on `siteId`
// (two-sided), and the ordinary waiver engine alone decides what a marker waives.
//
// ── THE COMMITTED ROW CARRIES NO COORDINATE (work item 0009) ────────────────────────────────────────────
// A line number in committed data stales on every insertion above it, and the census file alone was touched
// by about one commit in eleven for that reason. So the committed row is the JUDGMENT keyed by the move-stable
// `siteId` ({@link CaughtFailureJudgment}); the coordinates ({@link CaughtFailureRow}) are derived at read
// time from the shared classifier and never written.

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

/** The three detector arms. ONE tuple, so a fourth arm is a row here and `tsc` finds every reader
 *  (Spine-TypeScript-and-Patterns.md, string-union dispatch). Homed beside the census verdicts rather than
 *  in `lib/caught-failure.ts` (#1988): the arm crosses the lib↔policy boundary three ways — the detector
 *  raises it, `gates/caught-failure-ownership.ts` keys its per-arm message map on it, and both the census
 *  generator and its repo pin enumerate it. */
export const CAUGHT_FAILURE_ARMS = ["default", "empty", "promise"] as const;
export type CaughtFailureArm = (typeof CAUGHT_FAILURE_ARMS)[number];

/** One COMMITTED census row: the judgment a site resolves to, keyed by its move-stable identity. */
export interface CaughtFailureJudgment {
  /** Stable across line moves: the path, the enclosing declaration, the reported position and the 1-based
   *  occurrence of that position within that declaration, joined by `::`. Its one spelling is
   *  `lib/caught-failure-identity.ts#keyCaughtFailureSites`. */
  readonly siteId: string;
  readonly verdict: CaughtFailureVerdict;
  /** The FULL reason out of the `@orb-waive` marker the central engine bound to this site, verbatim — null
   *  for `unproven`. */
  readonly reason: string | null;
}

/** One LIVE site: the judgment joined with what the tree says about it at read time. Never committed —
 *  `line`, `column`, `snippet` and `markerLine` move when a line is inserted above the site, and the rest is
 *  already spelled by `siteId` or re-derived by the classifier. */
export interface CaughtFailureRow extends CaughtFailureJudgment {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  /** The detector arm, always a member of {@link CAUGHT_FAILURE_ARMS}. */
  readonly grammar: CaughtFailureArm;
  /** The exact token the finding reports and a marker must name. */
  readonly position: string;
  /** Multiplicity: the 1-based occurrence of this position within its enclosing declaration. */
  readonly ordinal: number;
  readonly snippet: string;
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
  readonly rows: readonly CaughtFailureJudgment[];
}
