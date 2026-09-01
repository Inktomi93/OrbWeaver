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
}

export type PopulationAccounting = Readonly<Partial<Record<DesignAuditRuleId, RulePopulationAccounting>>>;

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
