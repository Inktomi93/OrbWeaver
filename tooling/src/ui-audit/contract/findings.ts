// The verdict shapes of ui-audit: severity ladder + the Finding row every check returns.
// Split from the pre-move design-audit-checks.ts monolith (P3 of #393); provenance: lib/collect.ts header.

import type { DesignAuditRuleId, DesignAuditRuleSeverityById, DesignAuditSeverity } from "./rules.ts";
import { DESIGN_AUDIT_SEVERITIES } from "./rules.ts";

export const SEVERITIES = DESIGN_AUDIT_SEVERITIES;
export type Severity = DesignAuditSeverity;

/** Which detector family a rule came from — "impeccable" rules are adaptations (see header). */
export type RuleOrigin = "orbweaver" | "impeccable";

interface FindingFields {
  readonly selector: string;
  readonly value: string;
  readonly message: string;
  readonly origin: RuleOrigin;
}

/** A rule and severity are one verdict, not two independent vocabularies. */
export type Finding = {
  readonly [RuleId in DesignAuditRuleId]: FindingFields & {
    readonly rule: RuleId;
    readonly severity: DesignAuditRuleSeverityById[RuleId];
  };
}[DesignAuditRuleId];
