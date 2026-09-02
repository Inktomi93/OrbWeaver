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
