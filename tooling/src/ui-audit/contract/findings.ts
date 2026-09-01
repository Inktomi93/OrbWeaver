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
export interface RulePopulationAccounting {
  readonly candidates: number;
  readonly judged: number;
  readonly affected: number;
  readonly populations: number;
  readonly emitted: number;
  readonly withheld: Readonly<Record<string, number>>;
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
