// Policy array validation for conformance runs, extracted from policy-conformance.ts.
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import { assertGatePolicyDescriptor } from "../lib/policy-validation.ts";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function invocationPolicies(policies: readonly GatePolicy[]): readonly GatePolicy[] {
  const candidates: unknown = policies;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error("verifyPolicyProofs requires a nonempty policy array");
  }
  const ids = new Set<string>();
  const validated: GatePolicy[] = [];
  for (const candidate of candidates) {
    if (!isDefinedGatePolicy(candidate)) {
      throw new Error("verifyPolicyProofs accepts only policies branded by defineGate");
    }
    assertGatePolicyDescriptor(candidate);
    if (ids.has(candidate.id)) {
      throw new Error(`verifyPolicyProofs received duplicate policy id ${candidate.id}`);
    }
    ids.add(candidate.id);
    validated.push(candidate);
  }
  return validated.toSorted((left, right) => left.id.localeCompare(right.id));
}
