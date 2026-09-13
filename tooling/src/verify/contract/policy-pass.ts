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

/** THE DISPATCHER'S REFUSAL VOCABULARY — every fixed sentence the final runtime says when it REFUSES an owner
 *  (a receipt that resolved nothing, a fact read too early, a finding outside the population, a resource that
 *  came back broken), as ONE data home (#2111). The emitters in `lib/policy-pass.ts`, `lib/policy-pass-context.ts`,
 *  `lib/resource-declaration.ts`, `lib/resource-policy.ts` and `lib/population-resolver.ts` compose their messages
 *  from these, and `lib/policy-refusal-envelope.ts` reads the same constants to refuse a `mustRefuse` row whose
 *  `messageIncludes` is nothing but one of them — a row naming `"resolved zero members"` holds on EVERY receipt
 *  refusal of every policy and discriminates nothing (§4.5b). The policy-AUTHORED slots (a receipt source, a fact
 *  id, a resource identity, a path) are what a row must name, and they are deliberately not here. Same bytes as
 *  before the extraction: every test asserting these by literal still holds. */
export const POLICY_PASS_REFUSALS = Object.freeze({
  populationUnresolved: "population has not resolved",
  emptyIntersection: "requested selection has an empty policy intersection",
  entireDeferred: "entire-population policy deferred for a proper subset selection",
  entireWithoutEvaluate:
    "declares execution entire-population but exposes no evaluate hook — with no post-walk phase its verdict composes per file, and selected-files is the honest execution",
  nonResourceReceivedResources: "received resource paths",
  resourceOnlyNoPaths: "resolved no resource paths",
  factEmptyPopulation: "resolved an empty declared population",
  receiptResolvedZero: "resolved zero",
  receiptLeftUnresolvedHead: "left",
  receiptLeftUnresolvedTail: "unresolved",
  factNoReceipt: "fact produced no semantic receipt",
  factNoResourceReceipt: "declared fact resource population produced no resource receipt",
  factUnconsumedPaths: "declared fact resource population has unconsumed paths",
  factUnconsumedRequests: "declared fact resource population has unconsumed requests",
  factReceiptRefused: "fact receipt refused",
  factFailed: "declared fact failed",
  factsNotConsumed: "declared facts were not consumed",
  factsNoReceipt: "declared facts produced no semantic receipt",
  resourcesNoReceipt: "declared resource population produced no resource receipt",
  resourcesUnconsumedPaths: "declared resource population has unconsumed paths",
  resourcesUnconsumedRequests: "declared resource population has unconsumed requests",
  policyReceiptRefused: "policy receipt refused",
  sourceOutsidePopulation: "source file is outside the effective population",
  sourcePathOutsidePopulation: "sourceFile path is absent or outside the effective population",
  findingOutsidePopulation: "finding file is outside the effective population",
  factUndeclared: "requested undeclared fact",
  factAbsent: "declared fact is absent from this pass",
  factNotFinished: "declared fact is not finished",
  syntaxOwnerChecker: "cannot access the type checker",
  resourceDeclaration: "resource declaration",
  resourceDeclarationEmpty: "resolved an empty fact",
  resourceDeclarationCrossRoot: "returned a cross-root fact",
  resourceDeclarationDemand: "is demand-driven and cannot be acquired without a subject",
  resourceCameBack: "was declared ready by population resolution but came back",
  resourceRequestUndeclared: "is undeclared",
  resourceOutsidePopulation: "is outside the effective resource population",
  exactFilesZeroIds: "exact files were demanded for zero ids",
  populationEmptyCorpus: "Invalid population resolution: candidate corpus is empty",
  populationAdmittedZero: "Invalid population resolution: expression admitted zero paths from",
});

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

/** What the dispatcher has for one declared fact at a given moment (#1988). `lib/policy-pass-context.ts`
 *  writes it and the pass reads it to withhold every dependent of a failed fact, so the registry crosses a
 *  module boundary inside the runtime and `lib/` is not a type home.
 *  @public knip type-face false positive — the value type of the exported `PolicyFactValueRegistry` map below, never named at a call site. */
export type PolicyFactValueEntry =
  | { readonly status: "pending" }
  | { readonly status: "ready"; readonly value: unknown }
  | { readonly status: "failed"; readonly message: string };

export type PolicyFactValueRegistry = Map<GateFact, PolicyFactValueEntry>;
