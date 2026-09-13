// Typed command and execution-plan data for the final policy runtime. Parsing and planning stay pure;
// the CLI composition root supplies the reviewed scope manifest and ResourceHost-derived path manifests.
import type { Project } from "ts-morph";
import type { GateAuthority, GateSeverity } from "./gate-authority.ts";
import type { GatePolicyExecution, PolicyProofArm } from "./policy.ts";
import type { PolicyOwnerPlanMode, PolicyPassInput, PolicyPassResult, PolicyPopulationReceipt } from "./policy-pass.ts";
import type { GatePolicyAnalysis } from "./policy-primitives.ts";
import type { PolicyProgramMembership, PolicyScopeRequest, PolicyScopeResolution, PolicySemanticPath } from "./policy-scope.ts";
import type { PopulationExpr } from "./population.ts";
import type { GateResourceRequest } from "./resource-declaration.ts";
import type { ResourceHostOptions } from "./resource-host.ts";
import type { RunnableVerifyTier } from "./stage.ts";
import { RUNNABLE_VERIFY_TIERS } from "./stage.ts";

export const POLICY_RUN_TIERS = RUNNABLE_VERIFY_TIERS;
export type PolicyRunTier = RunnableVerifyTier;

export type PolicySelector =
  | { readonly kind: "all" }
  | { readonly kind: "check"; readonly names: readonly string[] }
  | { readonly kind: "family"; readonly names: readonly string[] };

export type PolicyCommandRequest =
  | {
      readonly mode: "run";
      readonly tier: PolicyRunTier;
      readonly scope: PolicyScopeRequest;
      readonly selector: PolicySelector;
      readonly strictScope: boolean;
      readonly failOnWarnings: boolean;
      readonly json: boolean;
    }
  | { readonly mode: "list"; readonly json: boolean }
  | { readonly mode: "explain"; readonly selector: Exclude<PolicySelector, { readonly kind: "all" }>; readonly json: boolean };

export type PolicyCommandParseResult =
  | { readonly ok: true; readonly request: PolicyCommandRequest }
  | { readonly ok: false; readonly exitCode: 3; readonly message: string };

export interface PolicyRosterEntry {
  readonly id: string;
  readonly family: string;
  readonly authority: GateAuthority;
  readonly severity: GateSeverity;
  readonly workItem: number | null;
  readonly population: PopulationExpr;
  readonly analysis: GatePolicyAnalysis;
  readonly execution: GatePolicyExecution;
  readonly facts: readonly string[];
  readonly resources: readonly GateResourceRequest[];
  readonly message: string;
  readonly fix: string | null;
  readonly proofCounts: Readonly<Record<PolicyProofArm, number>>;
}

export interface PlannedPolicy {
  readonly policyId: string;
  readonly family: string;
  readonly mode: PolicyOwnerPlanMode;
  readonly reason: string | null;
  readonly population: PolicyPopulationReceipt;
}

export interface PlannedFact {
  readonly factId: string;
  readonly population: PolicyPopulationReceipt;
}

export interface PolicyRunPlan {
  readonly mode: "run";
  readonly tier: PolicyRunTier;
  readonly scope: PolicyScopeResolution;
  readonly selector: PolicySelector;
  readonly strictScope: boolean;
  readonly failOnWarnings: boolean;
  readonly json: boolean;
  readonly policyIds: readonly string[];
  readonly policies: readonly PlannedPolicy[];
  readonly facts: readonly PlannedFact[];
  readonly programs: readonly PolicyProgramMembership[];
  readonly requestedProgramIds: readonly string[];
  readonly requestedPaths: readonly PolicySemanticPath[] | null;
  readonly resourcePathsByPolicy: Readonly<Record<string, readonly string[]>>;
  readonly resourcePathsByFact: Readonly<Record<string, readonly string[]>>;
}

export type PolicyInspectionPlan =
  | { readonly mode: "list"; readonly json: boolean; readonly policies: readonly PolicyRosterEntry[]; readonly families: readonly string[] }
  | {
      readonly mode: "explain";
      readonly json: boolean;
      readonly selector: Exclude<PolicySelector, { readonly kind: "all" }>;
      readonly policies: readonly PolicyRosterEntry[];
    };

export type PolicyCommandPlan = PolicyRunPlan | PolicyInspectionPlan;

export type PolicyPlanningResult =
  | { readonly ok: true; readonly plan: PolicyCommandPlan }
  | { readonly ok: false; readonly exitCode: 2 | 3; readonly message: string };

export interface PolicyPlannerCorpus {
  readonly gates: readonly import("./policy.ts").GatePolicy[];
  readonly families: readonly string[];
}

export interface PolicyPlannerInput {
  readonly request: PolicyCommandRequest;
  readonly corpus: PolicyPlannerCorpus;
  readonly scope?: PolicyScopeResolution;
  /** Required only when a selected descriptor declares resources. */
  readonly resourceOptions?: ResourceHostOptions;
}

export interface PolicyPlanExecutionInput extends Pick<PolicyPassInput, "reviewedGrants" | "resourceOptions"> {
  readonly root: string;
  readonly project: Project;
  readonly corpus: PolicyPlannerCorpus;
  readonly plan: PolicyRunPlan;
}

export type PolicyPlanExecutionResult =
  | { readonly ok: true; readonly exitCode: 0 | 1 | 2; readonly plan: PolicyRunPlan; readonly pass: PolicyPassResult }
  | { readonly ok: false; readonly exitCode: 2; readonly message: string };
