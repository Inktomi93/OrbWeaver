// The verdict shapes of ui-audit: severity ladder + the Finding row every check returns.
// Split from the pre-move design-audit-checks.ts monolith (P3 of #393); provenance: lib/collect.ts header.

export const SEVERITIES = ["P0", "P1", "P2", "P3"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Which detector family a rule came from — "impeccable" rules are adaptations (see header). */
export type RuleOrigin = "orbweaver" | "impeccable";

export interface Finding {
  readonly rule: string;
  readonly severity: Severity;
  readonly selector: string;
  readonly value: string;
  readonly message: string;
  readonly origin: RuleOrigin;
}
