// The verdict shapes of ui-audit: severity ladder + the Finding row every check returns.
// Split from the pre-move design-audit-checks.ts monolith (P3 of #393); provenance: lib/collect.ts header.

import type { DesignAuditRuleId, DesignAuditRuleSeverityById, DesignAuditSeverity } from "./rules.ts";
import { DESIGN_AUDIT_SEVERITIES } from "./rules.ts";

export const SEVERITIES = DESIGN_AUDIT_SEVERITIES;
export type Severity = DesignAuditSeverity;

/** Which detector family a rule came from — "impeccable" rules are adaptations (see header). */
export type RuleOrigin = "orbweaver" | "impeccable";

/** Bounded presentation over a complete judged population. `capped` is affected instances omitted from
 * the representative list, never omitted from the verdict or machine denominator. */
export interface FindingPopulation {
  readonly affected: number;
  readonly judged: number;
  readonly capped: number;
}

/** THE TWO STRUCTURAL WITHHELD REASONS (#1317 item 4). Most `withheld` keys are rule-owned free text —
 *  a truncated target extent and a missing label/control relation are different facts and neither is
 *  this file's business. These two are NOT rule-owned: they are minted by the collection strategies and
 *  read back, by string, at seven sites across four files, each with distinct semantics that a bare
 *  `"cap"` literal states nowhere. Homed here beside `RulePopulationAccounting` — the row they land in —
 *  and derived, the way `CENSUS_CAP_FAMILIES` already is, so a reader that spells one by hand is a tsc
 *  error rather than a silent mismatch. */
export const WITHHELD_REASONS = {
  /** NODE's REPRESENTATIVE cap: instances that WERE judged and are omitted from the printed list only.
   *  Presentation, never missing evidence — it settles `affected = emitted + cap + collapsed` and is the
   *  one reason `populationEvidenceGap` does not treat as NO VERDICT. `assertCensusAccounting` REFUSES a
   *  walker that supplies it: the walker has no representative list to cap. */
  representativeCap: "cap",
  /** The WALKER's census bound: carriers the in-page census counted and could not carry out, so the
   *  check never saw them. Absence of a measurement ⇒ the run is NO VERDICT for that rule. Deliberately
   *  a different word from `representativeCap` — conflating the two would launder a truncated census
   *  into a presentation detail. */
  censusCapExceeded: "capExceeded",
} as const;

export type WithheldReason = (typeof WITHHELD_REASONS)[keyof typeof WITHHELD_REASONS];

/** The closed set of withheld reasons that do NOT make a run partial — the tuple every "is this row
 *  still complete?" reader filters by, rather than each re-spelling `"cap"`. A second presentation-only
 *  reason is one member here and every reader picks it up. */
export const PRESENTATION_WITHHELD_REASONS: readonly WithheldReason[] = [WITHHELD_REASONS.representativeCap];

/** Whole-family accounting. Withholding reasons are rule-owned because a truncated target extent and a
 * missing label/control relation are different facts, but both must remain machine-visible. */
/** Walker-side denominator before Node settles findings, collapses authored repeats, and applies
 *  representative caps. It lives HERE, beside `RulePopulationAccounting`, rather than in
 *  `samples-populations.ts`: the per-rule sample files (`samples-occlusion.ts`, `samples-hover.ts`) need
 *  it, and `samples-populations.ts` imports THOSE to compose its per-rule map — so homing the shape in the
 *  aggregator made a type-only import CYCLE that `no-circular` reds. `findings.ts` depends only on
 *  `rules.ts`, so it is the leaf both sides can reach without one. */
export interface RelationalCensusAccountingInput {
  readonly candidates: number;
  readonly judged: number;
  readonly withheld: Readonly<Record<string, number>>;
  readonly excluded: Readonly<Record<string, number>>;
  /** How many CANDIDATES arrived by a named non-default route (#1172: `pseudo` — a promotion carried by a
   *  `::before`/`::after` rather than by the element the walk visits). A TAG, never a disposition: every
   *  tagged candidate is still judged, withheld or excluded exactly once, so this sits outside the
   *  settlement arithmetic and is bounded only by `candidates`. It exists so a route's whole cohort cannot
   *  enter or leave a denominator invisibly — a census that silently stopped seeing pseudo carriers reads
   *  identically to a surface that has none, which is the blindness #1172 named. Absent = the census has
   *  no alternate route. */
  readonly carried?: Readonly<Record<string, number>>;
  /** A bounded, deduped list of REPRESENTATIVE subjects per withheld reason (#1704) — the walker's own
   *  `describe()` of a carrier the census could not judge. A withheld tally alone is unactionable: three
   *  design-audit passes on Characters over a week all ended on `selection-idiom: unmatchedUnselected=2`
   *  with no way to find either cohort, so the printed remedy could never be tested against them. Outside
   *  the settlement arithmetic by construction (the `carried` precedent) — evidence ABOUT a tally, never a
   *  disposition — and capped at 3 per reason, with the COUNT beside it as the complete number. */
  readonly withheldSubjects?: Readonly<Record<string, readonly string[]>>;
}

export interface RulePopulationAccounting {
  readonly candidates: number;
  readonly judged: number;
  readonly affected: number;
  readonly populations: number;
  readonly emitted: number;
  readonly withheld: Readonly<Record<string, number>>;
  /** Candidates reached by the rule's structural prefilter and then proved semantically inapplicable.
   * Closed exclusions remain denominator evidence but never make the verdict partial. */
  readonly excluded: Readonly<Record<string, number>>;
  /** Affected rendered targets already adjudicated by the same authored decision. These are not missing
   * judgments and therefore never make the run partial. */
  readonly collapsed: Readonly<Record<string, number>>;
  /** The walker's `carried` tag, carried through to the printed row — see
   * `RelationalCensusAccountingInput.carried`. Outside the settlement arithmetic by construction. */
  readonly carried?: Readonly<Record<string, number>>;
  /** The walker's withheld SUBJECTS, carried through to the printed row and to the NO-VERDICT detail —
   * see `RelationalCensusAccountingInput.withheldSubjects` (#1704). Outside the arithmetic, same as
   * `carried`. */
  readonly withheldSubjects?: Readonly<Record<string, readonly string[]>>;
}

export type PopulationAccounting = Readonly<Partial<Record<DesignAuditRuleId, RulePopulationAccounting>>>;

/** ONE candidate's disposition under ONE rule — the shape a `checks-*.ts` classifier returns and
 *  `lib/population-strategies.ts`'s rung-2 `partitionedFindings` tallies. `judged` carries the verdict
 *  (a Finding, or a clean pass); the other two carry a rule-owned reason string that reaches the report
 *  and the JSON receipt. The polarity is #987's: `withheld` = the rule APPLIES and the instrument could
 *  not judge it, which makes the run NO VERDICT; `excluded` = measured facts prove the rule
 *  inapplicable, which is complete evidence. Homed here beside `RulePopulationAccounting` because five
 *  `lib/checks-*.ts` files produce it and one strategy consumes it. */
export type CandidateDisposition =
  | { readonly kind: "judged"; readonly finding: Finding | null }
  | { readonly kind: "withheld"; readonly reason: string }
  | { readonly kind: "excluded"; readonly reason: string };

/** THE PAGE-SUBJECT SENTINEL. Three rules judge the DOCUMENT, not an element — `script-error` (an
 *  uncaught exception belongs to the page), `off-theme-font` (the page's censused face set) and
 *  `flat-type-hierarchy` (the page's size set) — and they have always spelled their `selector` as the
 *  literal word `page`. It is named here, beside the field it fills, because a READER now depends on
 *  telling it from a CSS selector: Snap's design-audit arm proves every emitted selector resolves to
 *  exactly one element (#1326), and `page` resolves to none — which is correct, not a defect, and would
 *  otherwise be reported as an unlocatable finding on every surface with a stray font face. */
export const PAGE_SUBJECT_SELECTOR = "page";

interface FindingFields {
  readonly selector: string;
  readonly value: string;
  readonly message: string;
  readonly origin: RuleOrigin;
  readonly representatives?: readonly string[];
  readonly population?: FindingPopulation;
}

/** A rule and severity are one verdict, not two independent vocabularies. */
export type Finding = {
  readonly [RuleId in DesignAuditRuleId]: FindingFields & {
    readonly rule: RuleId;
    readonly severity: DesignAuditRuleSeverityById[RuleId];
  };
}[DesignAuditRuleId];
