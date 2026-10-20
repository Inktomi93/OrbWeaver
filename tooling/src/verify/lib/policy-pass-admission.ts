// Invocation admission: the policy rosters and owner plans runPolicyPass refuses before any population is resolved.
import type { GateFact } from "../contract/fact.ts";
import { factProvider } from "../contract/fact.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { PolicyPassInput } from "../contract/policy-pass.ts";
import { POLICY_OWNER_PLAN_MODES } from "../contract/policy-pass.ts";
import { assertGatePolicyDescriptor } from "./policy-validation.ts";

export function assertInvocationPolicies(policies: readonly GatePolicy[]): void {
  const value: unknown = policies;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("runPolicyPass requires a nonempty policy array");
  }
  const ids = new Set<string>();
  const facts = new Map<string, GateFact>();
  for (const candidate of value) {
    if (!isDefinedGatePolicy(candidate)) {
      throw new Error("runPolicyPass accepts only policies branded by defineGate");
    }
    assertGatePolicyDescriptor(candidate);
    if (ids.has(candidate.id)) {
      throw new Error(`runPolicyPass received duplicate policy id ${candidate.id}`);
    }
    ids.add(candidate.id);
    for (const fact of candidate.facts.map(factProvider)) {
      const existing = facts.get(fact.id);
      if (existing !== undefined && existing !== fact) {
        throw new Error(`loaded policies import different fact descriptors with id ${fact.id}`);
      }
      facts.set(fact.id, fact);
    }
  }
}

export function assertSelectedPoliciesAreLoaded(knownPolicies: readonly GatePolicy[], selectedPolicies: readonly GatePolicy[]): void {
  const knownById = new Map(knownPolicies.map((policy) => [policy.id, policy]));
  for (const policy of selectedPolicies) {
    const known = knownById.get(policy.id);
    if (known === undefined) {
      throw new Error(`runPolicyPass selected policy is absent from the known roster: ${policy.id}`);
    }
    if (known !== policy) {
      throw new Error(`runPolicyPass selected policy is not the loaded descriptor identity: ${policy.id}`);
    }
  }
}

export function assertOwnerPlans(input: PolicyPassInput): void {
  const plans = input.ownerPlansByPolicy;
  if (plans === undefined) {
    return;
  }
  if (!(plans instanceof Map)) {
    throw new Error("runPolicyPass owner plans must be a Map");
  }
  const expected = input.policies.map(({ id }) => id).toSorted((left, right) => left.localeCompare(right));
  const actual = [...plans.keys()].toSorted((left, right) => left.localeCompare(right));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("runPolicyPass owner plans must cover exactly the selected policies");
  }
  for (const [policyId, plan] of plans) {
    if (!(POLICY_OWNER_PLAN_MODES as readonly string[]).includes(plan.mode)) {
      throw new Error(`runPolicyPass owner plan mode is invalid for ${policyId}`);
    }
    if ((plan.mode === "run") !== (plan.reason === null)) {
      throw new Error(`runPolicyPass owner plan reason disagrees with mode for ${policyId}`);
    }
    if (plan.reason !== null && plan.reason.trim().length === 0) {
      throw new Error(`runPolicyPass owner plan reason is blank for ${policyId}`);
    }
  }
}
