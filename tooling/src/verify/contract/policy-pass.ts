// Exact population, phase, owner, and authority receipts emitted by the final policy dispatcher.
import type { Project } from "ts-morph";
import type { GateFact } from "./fact.ts";
import type { GateAuthorityBatchResult, GateOwnerCompletion, RawGateFinding, ReviewedGateGrant } from "./gate-authority.ts";
import type { OrdinaryWaiverCarrierRefusal } from "./ordinary-waiver-source.ts";
import type { GatePolicy } from "./policy.ts";
import type { ResourceHostOptions } from "./resource-host.ts";

export const POLICY_PHASES = ["population", "create", "visitFile", "visit", "evaluate", "receipt"] as const;
export type PolicyPhase = (typeof POLICY_PHASES)[number];
export const GATE_FACT_PHASES = ["population", "create", "visitFile", "visit", "finish", "receipt"] as const;
export type GateFactPhase = (typeof GATE_FACT_PHASES)[number];

export interface PolicyPopulationReceipt {
  readonly declaredSourcePaths: readonly string[];
  readonly declaredResourcePaths: readonly string[];
  /** The caller's exact normalized set, or null when the complete population was requested. */
  readonly requestedPaths: readonly string[] | null;
  readonly effectiveSourcePaths: readonly string[];
  readonly effectiveResourcePaths: readonly string[];
}

export const POLICY_OWNER_PLAN_MODES = ["run", "deferred", "skipped"] as const;
export type PolicyOwnerPlanMode = (typeof POLICY_OWNER_PLAN_MODES)[number];

export interface PolicyOwnerPlan {
  readonly mode: PolicyOwnerPlanMode;
  readonly reason: string | null;
  readonly population: PolicyPopulationReceipt;
}

export type PolicySemanticReceipt =
  | { readonly kind: "population"; readonly source: string; readonly members: number; readonly unresolved: number }
  | { readonly kind: "resource"; readonly source: string; readonly resources: number; readonly unresolved: number };

export interface PolicyTiming {
  readonly totalMs: number;
  readonly phaseMs: Readonly<Record<PolicyPhase, number>>;
}

export interface PolicyToolError {
  readonly policyId: string;
  readonly phase: PolicyPhase;
  readonly message: string;
}

export interface GateFactToolError {
  readonly factId: string;
  readonly phase: GateFactPhase;
  readonly message: string;
}

export interface GateFactOwnerResult {
  readonly id: string;
  readonly status: "success" | "incomplete";
  readonly population: PolicyPopulationReceipt;
  readonly receipts: readonly PolicySemanticReceipt[];
  readonly timing: { readonly totalMs: number; readonly phaseMs: Readonly<Record<GateFactPhase, number>> };
  readonly error: string | null;
}

export interface PolicyOwnerResult {
  readonly id: string;
  readonly owner: GateOwnerCompletion;
  readonly population: PolicyPopulationReceipt;
  readonly findings: readonly RawGateFinding[];
  readonly receipts: readonly PolicySemanticReceipt[];
  readonly timing: PolicyTiming;
}

export interface PolicyPassTiming {
  readonly totalMs: number;
  readonly policyMs: number;
  readonly factMs: number;
}

/** Internal invocation input. Project/root stop here and never enter GatePolicyContext. */
export interface PolicyPassInput {
  /** Full loaded policy roster. Authority reconciliation needs unselected policy metadata. */
  readonly knownPolicies: readonly GatePolicy[];
  readonly policies: readonly GatePolicy[];
  readonly root: string;
  readonly project: Project;
  readonly requestedPaths?: readonly string[];
  /** Planner-owned disposition and exact population; absent only for direct/conformance pass callers. */
  readonly ownerPlansByPolicy?: ReadonlyMap<string, PolicyOwnerPlan>;
  /** Fixture overlays/parser injection cannot override this invocation's root or reuse a prior host. */
  readonly resourceOptions?: Omit<ResourceHostOptions, "root">;
  readonly reviewedGrants: readonly ReviewedGateGrant[];
  readonly failOnWarnings: boolean;
}

export interface PolicyPassResult {
  readonly facts: readonly GateFactOwnerResult[];
  readonly policies: readonly PolicyOwnerResult[];
  readonly factErrors: readonly GateFactToolError[];
  readonly toolErrors: readonly PolicyToolError[];
  /** Ordinary-waiver carriers the reader refused. A skip with a reason, not a suppressed population. */
  readonly waiverCarrierRefusals: readonly OrdinaryWaiverCarrierRefusal[];
  readonly authority: GateAuthorityBatchResult;
  readonly timing: PolicyPassTiming;
}

/** Runtime-only loaded fact token union derived from selected policy descriptors. */
export type SelectedGateFact = GateFact;

/** What the dispatcher has for one declared fact at a given moment (#1988). `lib/policy-pass-context.ts`
 *  writes it and the pass reads it to withhold every dependent of a failed fact, so the registry crosses a
 *  module boundary inside the runtime and `lib/` is not a type home. */
export type PolicyFactValueEntry =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly value: unknown }
  | { readonly status: "failed"; readonly message: string };

export type PolicyFactValueRegistry = Map<GateFact, PolicyFactValueEntry>;
