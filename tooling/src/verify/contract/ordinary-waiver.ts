// Final ordinary-waiver acquisition and reconciliation contract.
import type { SourceFile } from "ts-morph";
import type { CoordinatedGateFinding, OrdinaryAuthorityAlarm, SelectedGatePolicy } from "./gate-authority.ts";

export interface OrdinaryWaiverEngineInput {
  /** Repo-relative POSIX paths from the policy pass; only authored `.ts`/`.tsx` files carry waivers. */
  readonly sourceFiles: ReadonlyMap<string, SourceFile>;
  /** The full loaded roster, including policies not selected for this invocation. */
  readonly knownPolicies: readonly SelectedGatePolicy[];
}

export type OrdinaryWaiverMarkerOutcome =
  | "malformed"
  | "unknown-policy"
  | "wrong-authority"
  | "stale"
  | "dead-position"
  | "unbound-trivia"
  | "ambiguous-trivia"
  | "over-broad"
  | "duplicate-target"
  | "matched";

export interface OrdinaryWaiverMarkerMatch {
  readonly id: string;
  readonly policyId: string;
  readonly outcome: OrdinaryWaiverMarkerOutcome;
  readonly candidateCount: number;
}

export interface OrdinaryWaiverBindingFailure {
  readonly policyId: string;
  readonly message: string;
}

/** `waiverIds[index]` corresponds to the finding at the same input index. */
export interface OrdinaryWaiverMatchResult {
  readonly waiverIds: readonly (string | null)[];
  /** Candidate consumption, including over-broad/duplicate matches that suppress nothing. */
  readonly consumption: ReadonlyMap<string, number>;
  /** Opaque-to-callers reconciliation evidence produced by the same batch match. */
  readonly markers: readonly OrdinaryWaiverMarkerMatch[];
  readonly bindingFailures: readonly OrdinaryWaiverBindingFailure[];
}

export interface OrdinaryWaiverReconciliationInput {
  readonly completedPolicyIds: readonly string[];
  readonly match: OrdinaryWaiverMatchResult;
}

export interface OrdinaryWaiverEngine {
  /** Match one complete coordinated batch; cardinality is decided before anything is suppressed. */
  readonly match: (findings: readonly CoordinatedGateFinding[]) => OrdinaryWaiverMatchResult;
  /** Emit liveness/cardinality alarms only for completed ordinary owners. */
  readonly reconcile: (input: OrdinaryWaiverReconciliationInput) => readonly OrdinaryAuthorityAlarm[];
}

export type CreateOrdinaryWaiverEngine = (input: OrdinaryWaiverEngineInput) => OrdinaryWaiverEngine;
