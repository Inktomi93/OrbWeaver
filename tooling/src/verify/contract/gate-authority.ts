/** Closed authority/severity and owner-completion contract for central gate post-processing.
 * Policy metadata is added by the coordinator; detector findings cannot author it. */

import type { OrdinaryWaiverSource } from "./ordinary-waiver-source.ts";

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

/** Whether the owner walked its whole declared population or a requested subset of it. A `success` owner is
 *  complete over its effective population either way; only `whole` coverage can prove a reviewed grant stale,
 *  because a grant's finding may sit outside a subset. */
export const GATE_OWNER_COVERAGES = ["whole", "subset"] as const;
export type GateOwnerCoverage = (typeof GATE_OWNER_COVERAGES)[number];

export interface GateOwnerResult {
  readonly policyId: string;
  readonly populationFiles: readonly string[];
  readonly coverage: GateOwnerCoverage;
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

/** The alarm kinds, as ONE tuple: the three alarm interfaces below narrow on it, and the conformance runner's
 *  refusal envelope (`lib/policy-refusal-envelope.ts`) derives its `[<kind>]` tokens from it — so a fourth
 *  alarm is one row here and `tsc` finds every reader (string-union dispatch discipline). */
export const GATE_AUTHORITY_ALARM_KINDS = ["ordinary-waiver", "stale-reviewed-grant", "over-broad-reviewed-grant", "waiver-budget"] as const;
/** @public knip type-face false positive — a structural field (`kind`) of the exported `OrdinaryAuthorityAlarm` shape,
 *  never referenced by its own name at any call site. */
export type GateAuthorityAlarmKind = (typeof GATE_AUTHORITY_ALARM_KINDS)[number];

export interface OrdinaryAuthorityAlarm {
  readonly kind: Extract<GateAuthorityAlarmKind, "ordinary-waiver">;
  readonly policyId: string;
  readonly message: string;
  readonly waiverId?: string;
}

/** @public knip type-face false positive — an arm of the exported `GateAuthorityAlarm` union, reached by narrowing on
 *  its discriminant and never named at a call site. */
export interface StaleGrantAuthorityAlarm {
  readonly kind: Extract<GateAuthorityAlarmKind, "stale-reviewed-grant">;
  readonly policyId: string;
  readonly grantId: string;
  readonly subject: string;
  readonly operation: string;
  readonly message: string;
}

interface OverBroadGrantAuthorityAlarm {
  readonly kind: Extract<GateAuthorityAlarmKind, "over-broad-reviewed-grant">;
  readonly policyId: string;
  readonly grantId: string;
  readonly subject: string;
  readonly operation: string;
  readonly count: number;
  readonly message: string;
}

/** A whole-coverage owner whose waived plus granted count differs from its committed budget (`lib/waiver-ratchet.ts`). */
export interface WaiverBudgetAuthorityAlarm {
  readonly kind: Extract<GateAuthorityAlarmKind, "waiver-budget">;
  readonly policyId: string;
  readonly budget: number;
  readonly count: number;
  readonly message: string;
}

export type GateAuthorityAlarm = OrdinaryAuthorityAlarm | StaleGrantAuthorityAlarm | OverBroadGrantAuthorityAlarm | WaiverBudgetAuthorityAlarm;

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
  "invalid-grant",
  "duplicate-grant-id",
  "duplicate-grant-identity",
  "invalid-grant-authority",
] as const;
/** @public knip type-face false positive — a structural field (`kind`) of the exported `GateAuthorityToolError` shape,
 *  never referenced by its own name at any call site. */
export type GateAuthorityToolErrorKind = (typeof GATE_AUTHORITY_TOOL_ERROR_KINDS)[number];

/** A zero-consumption grant a subset owner could not judge: neither live nor stale. */
export interface UnjudgedReviewedGrant {
  readonly policyId: string;
  readonly grantId: string;
}

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

/** Committed waived plus granted allowance per policy id over the policy's whole declared population
 *  (`lib/waiver-budget.ts`). A policy with no row has a budget of zero. */
export type WaiverBudget = Readonly<Record<string, number>>;

/** Which selected policies this run judged against the budget, and which it could not because their owner did
 *  not walk the whole declared population (a scoped or application selection). An unjudged policy is neither
 *  within budget nor over it. */
export interface WaiverBudgetReport {
  readonly judged: readonly string[];
  readonly unjudged: readonly string[];
}

export interface GateAuthorityBatchInput {
  readonly knownPolicies: readonly SelectedGatePolicy[];
  readonly selectedPolicies: readonly SelectedGatePolicy[];
  readonly ordinaryWaiverSources: readonly OrdinaryWaiverSource[];
  readonly ownerResults: readonly GateOwnerResult[];
  readonly reviewedGrants: readonly ReviewedGateGrant[];
  /** Per-policy waived plus granted allowance. Absent for fixture and conformance passes, which judge no ratchet. */
  readonly waiverBudget?: WaiverBudget;
  readonly failOnWarnings: boolean;
}

export interface GateAuthorityBatchResult {
  readonly effectiveFindings: readonly CoordinatedGateFinding[];
  readonly waivedFindings: readonly WaivedGateFinding[];
  readonly grantedFindings: readonly GrantedGateFinding[];
  readonly authorityAlarms: readonly GateAuthorityAlarm[];
  readonly unjudgedReviewedGrants: readonly UnjudgedReviewedGrant[];
  /** Null when no budget was handed in. */
  readonly waiverBudget: WaiverBudgetReport | null;
  readonly toolErrors: readonly GateAuthorityToolError[];
  readonly withheldPolicyIds: readonly string[];
  readonly ordinaryConsumption: readonly AuthorityConsumption[];
  readonly reviewedGrantConsumption: readonly AuthorityConsumption[];
  readonly verdict: GateAuthorityVerdict;
}
