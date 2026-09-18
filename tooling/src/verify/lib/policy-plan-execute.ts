// EXECUTION of a validated final-policy plan: the corpus re-validated, the plan's ids, facts and resource
// manifests reconciled against it, the production pass run through its bound ResourceHost seam, and the
// executed populations reconciled against the plan. Split out of `policy-plan.ts` at the size cap
// (2026-09-18); it consumes that module's corpus validation and exit mapping, never the reverse.
import type { GatePolicy } from "../contract/policy.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type { PolicyPlanExecutionInput, PolicyPlanExecutionResult } from "../contract/policy-plan.ts";
import { runPolicyPass } from "./policy-pass.ts";
import { factsForPolicies, policyPassExitCode, validateCorpus } from "./policy-plan.ts";
import { normalizePathSet } from "./policy-validation.ts";

function executionPolicies(input: PolicyPlanExecutionInput): readonly GatePolicy[] {
  const policies = validateCorpus({ corpus: input.corpus });
  const byId = new Map(policies.map((policy) => [policy.id, policy]));
  const ids = normalizePathSet(input.plan.policyIds, "planned policy id");
  if (ids.length === 0 || JSON.stringify(ids) !== JSON.stringify(input.plan.policyIds)) {
    throw new Error("policy execution plan ids must be nonempty, sorted, and unique");
  }
  if (JSON.stringify(input.plan.policies.map(({ policyId }) => policyId)) !== JSON.stringify(ids)) {
    throw new Error("policy execution plan rows disagree with selected policy ids");
  }
  return ids.map((id) => {
    const policy = byId.get(id);
    if (policy === undefined) {
      throw new Error(`policy execution plan names an unloaded policy ${id}`);
    }
    return policy;
  });
}

function assertExecutionResourcePaths(plan: PolicyPlanExecutionInput["plan"]): void {
  const selected = new Set(plan.policyIds);
  const unknown = Object.keys(plan.resourcePathsByPolicy)
    .filter((policyId) => !selected.has(policyId))
    .toSorted();
  if (unknown.length > 0) {
    throw new Error(`policy execution resource population names unselected policies: ${unknown.join(", ")}`);
  }
  const expected = Object.fromEntries(
    plan.policies
      .filter(({ population }) => population.declaredResourcePaths.length > 0)
      .map(({ policyId, population }) => [policyId, population.declaredResourcePaths] as const),
  );
  const actual = Object.fromEntries(
    Object.entries(plan.resourcePathsByPolicy)
      .map(([policyId, paths]) => [policyId, normalizePathSet(paths, `resource path for ${policyId}`)] as const)
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("policy execution resource manifest disagrees with planned populations");
  }

  const selectedFacts = new Set(plan.facts.map(({ factId }) => factId));
  const unknownFacts = Object.keys(plan.resourcePathsByFact)
    .filter((factId) => !selectedFacts.has(factId))
    .toSorted();
  if (unknownFacts.length > 0) {
    throw new Error(`policy execution resource population names unselected facts: ${unknownFacts.join(", ")}`);
  }
  const expectedFacts = Object.fromEntries(
    plan.facts
      .filter(({ population }) => population.declaredResourcePaths.length > 0)
      .map(({ factId, population }) => [factId, population.declaredResourcePaths] as const),
  );
  const actualFacts = Object.fromEntries(
    Object.entries(plan.resourcePathsByFact)
      .map(([factId, paths]) => [factId, normalizePathSet(paths, `resource path for fact ${factId}`)] as const)
      .toSorted(([left], [right]) => left.localeCompare(right)),
  );
  if (JSON.stringify(actualFacts) !== JSON.stringify(expectedFacts)) {
    throw new Error("policy execution fact resource manifest disagrees with planned populations");
  }
}

function assertExecutionFacts(plan: PolicyPlanExecutionInput["plan"], policies: readonly GatePolicy[]): void {
  const running = new Set(plan.policies.filter(({ mode }) => mode === "run").map(({ policyId }) => policyId));
  const expected = factsForPolicies(policies.filter(({ id }) => running.has(id))).map(({ id }) => id);
  const actual = plan.facts.map(({ factId }) => factId);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("policy execution fact plan disagrees with runnable policy dependencies");
  }
}

function assertExecutedPopulations(plan: PolicyPlanExecutionInput["plan"], pass: PolicyPassResult): void {
  const actual = new Map(pass.policies.map((result) => [result.id, result]));
  for (const planned of plan.policies) {
    const result = actual.get(planned.policyId);
    if (result === undefined || JSON.stringify(result.population) !== JSON.stringify(planned.population)) {
      throw new Error(`policy execution population disagrees with its plan: ${planned.policyId}`);
    }
    if (planned.mode !== "run" && (result.owner.status !== "not-applicable" || result.owner.reason !== planned.reason)) {
      throw new Error(`policy execution disposition disagrees with its plan: ${planned.policyId}`);
    }
  }
  const actualFacts = new Map(pass.facts.map((result) => [result.id, result]));
  for (const planned of plan.facts) {
    const result = actualFacts.get(planned.factId);
    if (result === undefined || JSON.stringify(result.population) !== JSON.stringify(planned.population)) {
      throw new Error(`policy execution fact population disagrees with its plan: ${planned.factId}`);
    }
  }
}

/** Execute one validated plan through the production pass, including its bound ResourceHost seam. */
export function executePolicyPlan(input: PolicyPlanExecutionInput): PolicyPlanExecutionResult {
  try {
    const policies = executionPolicies(input);
    assertExecutionFacts(input.plan, policies);
    assertExecutionResourcePaths(input.plan);
    const requestedPaths = input.plan.scope.requestedPaths?.map(({ path }) => path);
    const pass = runPolicyPass({
      knownPolicies: input.corpus.gates,
      policies,
      root: input.root,
      project: input.project,
      ...(requestedPaths === undefined ? {} : { requestedPaths }),
      ownerPlansByPolicy: new Map(input.plan.policies.map(({ policyId, mode, reason, population }) => [policyId, { mode, reason, population }])),
      reviewedGrants: input.reviewedGrants,
      failOnWarnings: input.plan.failOnWarnings,
      ...(input.resourceOptions === undefined ? {} : { resourceOptions: input.resourceOptions }),
    });
    assertExecutedPopulations(input.plan, pass);
    return { ok: true, exitCode: policyPassExitCode(pass), plan: input.plan, pass };
  } catch (error) {
    return { ok: false, exitCode: 2, message: error instanceof Error ? error.message : String(error) };
  }
}
