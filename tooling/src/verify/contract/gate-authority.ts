/** Closed authority/severity and owner-completion contract for central gate post-processing.
 * Policy metadata is added by the coordinator; detector findings cannot author it. */

export const GATE_AUTHORITIES = ["hard", "ordinary", "reviewed-grant"] as const;
export type GateAuthority = (typeof GATE_AUTHORITIES)[number];

export const GATE_SEVERITIES = ["error", "warning"] as const;
export type GateSeverity = (typeof GATE_SEVERITIES)[number];

export interface SelectedGatePolicy {
  readonly id: string;
  readonly authority: GateAuthority;
  readonly severity: GateSeverity;
}

export interface RawGateFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly token?: string;
  readonly message?: string;
  readonly fix?: string;
  readonly subject?: string;
  readonly operation?: string;
  readonly policyId?: never;
  readonly severity?: never;
  readonly authority?: never;
}

export interface CoordinatedGateFinding extends Omit<RawGateFinding, "policyId" | "severity" | "authority"> {
  readonly policyId: string;
  readonly severity: GateSeverity;
}

export type GateOwnerCompletion =
  | { readonly status: "success"; readonly population: "complete" }
  | { readonly status: "not-applicable"; readonly population: "complete"; readonly reason: string }
  | { readonly status: "failure"; readonly population: "incomplete"; readonly reason: string }
  | { readonly status: "incomplete"; readonly population: "incomplete"; readonly reason: string };

export interface GateOwnerResult {
  readonly policyId: string;
  readonly populationFiles: readonly string[];
  readonly owner: GateOwnerCompletion;
  readonly findings: readonly RawGateFinding[];
}

export interface ReviewedGateGrant {
  readonly id: string;
  readonly policyId: string;
  readonly subject: string;
  readonly operation: string;
  readonly why: string;
  readonly endsWhen: string;
}

export interface WaivedGateFinding {
  readonly finding: CoordinatedGateFinding;
  readonly waiverId: string;
}

export interface GrantedGateFinding {
  readonly finding: CoordinatedGateFinding;
  readonly grantId: string;
}

export interface AuthorityConsumption {
  readonly id: string;
  readonly count: number;
}

export interface OrdinaryAuthorityAlarm {
  readonly kind: "ordinary-waiver";
  readonly policyId: string;
  readonly message: string;
  readonly waiverId?: string;
}

export interface StaleGrantAuthorityAlarm {
  readonly kind: "stale-reviewed-grant";
  readonly policyId: string;
  readonly grantId: string;
  readonly subject: string;
  readonly operation: string;
  readonly message: string;
}

export type GateAuthorityAlarm = OrdinaryAuthorityAlarm | StaleGrantAuthorityAlarm;

export const GATE_AUTHORITY_TOOL_ERROR_KINDS = [
  "invalid-policy",
  "duplicate-policy",
  "invalid-owner-result",
  "missing-owner-result",
  "duplicate-owner-result",
  "unselected-owner-result",
  "invalid-population",
  "invalid-finding",
  "invalid-finding-coordinate",
  "finding-spoofed-policy",
  "finding-outside-population",
  "not-applicable-with-findings",
  "owner-failure",
  "owner-incomplete",
  "invalid-reviewed-grant-identity",
  "invalid-waiver-id",
  "invalid-grant",
  "duplicate-grant-id",
  "duplicate-grant-identity",
] as const;
export type GateAuthorityToolErrorKind = (typeof GATE_AUTHORITY_TOOL_ERROR_KINDS)[number];

export interface GateAuthorityToolError {
  readonly kind: GateAuthorityToolErrorKind;
  readonly message: string;
  readonly policyId?: string;
  readonly findingIndex?: number;
  readonly grantId?: string;
}

export interface GateAuthorityVerdict {
  readonly errors: number;
  readonly warnings: number;
  readonly blocking: number;
  readonly failOnWarnings: boolean;
}

export interface OrdinaryReconciliationInput {
  readonly completedPolicyIds: readonly string[];
  readonly consumption: ReadonlyMap<string, number>;
}

export interface GateAuthorityBatchInput {
  readonly selectedPolicies: readonly SelectedGatePolicy[];
  readonly ownerResults: readonly GateOwnerResult[];
  readonly reviewedGrants: readonly ReviewedGateGrant[];
  readonly failOnWarnings: boolean;
  readonly waiverFor?: (finding: CoordinatedGateFinding) => string | null;
  readonly reconcileOrdinary?: (input: OrdinaryReconciliationInput) => readonly OrdinaryAuthorityAlarm[];
}

export interface GateAuthorityBatchResult {
  readonly effectiveFindings: readonly CoordinatedGateFinding[];
  readonly waivedFindings: readonly WaivedGateFinding[];
  readonly grantedFindings: readonly GrantedGateFinding[];
  readonly authorityAlarms: readonly GateAuthorityAlarm[];
  readonly toolErrors: readonly GateAuthorityToolError[];
  readonly withheldPolicyIds: readonly string[];
  readonly ordinaryConsumption: readonly AuthorityConsumption[];
  readonly reviewedGrantConsumption: readonly AuthorityConsumption[];
  readonly verdict: GateAuthorityVerdict;
}
