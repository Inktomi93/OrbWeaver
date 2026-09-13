// Shared request, disposition and result vocabulary for policy population selection.
import type { GatePolicyExecution } from "./policy.ts";
import type { PolicyPopulationReceipt } from "./policy-pass.ts";

/** `run` maps to a running owner; the other two are the two `not-applicable` reasons, whose WORDING stays with
 *  each caller (the planner's plan reason and `POLICY_PASS_REFUSALS` are different strings today, and unifying
 *  them is a refusal-envelope change this calculation has no standing to make). */
export type PolicySelectionDisposition = "run" | "deferred" | "empty-intersection";

/** The narrowed request, in its two forms — one nullable field rather than two that must agree.
 *
 *  `identity` and `current` differ by exactly the DELETED entries, and each caller spells `current` with the
 *  truth it holds: the planner passes `scope.currentPaths` (the inventory-filtered set, so a deleted identity
 *  never selects a path its programs still list), the dispatcher passes the identity set itself (its declared
 *  populations are resolved from the Project's own source files and the ResourceHost, so a deleted identity
 *  cannot survive the intersection there either). Both therefore intersect against an existence-filtered set
 *  and agree; giving the calculation `identity` alone would plan a run over a deleted file and then fail to
 *  find its `SourceFile` one phase later. */
export interface PolicyRequestedSelection {
  /** The caller's exact normalized set, copied verbatim into the receipt. */
  readonly identity: readonly string[];
  /** The subset of that request whose paths still exist. */
  readonly current: ReadonlySet<string>;
}

export interface PolicySelectionInput {
  readonly execution: GatePolicyExecution;
  readonly declaredSourcePaths: readonly string[];
  readonly declaredResourcePaths: readonly string[];
  /** The declared population of every fact this owner consumes — an INPUT, like a resource. Empty for a fact's
   *  own selection and for any owner that declares none. */
  readonly dependencyPaths: readonly string[];
  /** Null when the complete population was requested. */
  readonly requested: PolicyRequestedSelection | null;
}

export interface PolicySelectionResolution {
  readonly population: PolicyPopulationReceipt;
  readonly disposition: PolicySelectionDisposition;
}
