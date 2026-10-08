// Resource acquisition precedes policy evaluation; failed acquisitions remain attached to their owner.
import type { GateFact } from "../contract/fact.ts";
import type { GatePolicy } from "../contract/policy.ts";
import type { PolicyPlannerInput } from "../contract/policy-plan.ts";
import { resolveResourceOwnerPathResolution } from "./resource-declaration.ts";

export function resourceManifests(
  input: PolicyPlannerInput,
  policies: readonly GatePolicy[],
  facts: readonly GateFact[],
): {
  readonly policies: ReadonlyMap<string, readonly string[]>;
  readonly facts: ReadonlyMap<string, readonly string[]>;
  readonly policyFailures: ReadonlyMap<string, string>;
  readonly factFailures: ReadonlyMap<string, string>;
} {
  if (![...policies, ...facts].some((owner) => owner.resources.length > 0)) {
    return { policies: new Map(), facts: new Map(), policyFailures: new Map(), factFailures: new Map() };
  }
  if (input.resourceOptions === undefined) {
    throw new Error("policy/fact resource planning requires ResourceHost options");
  }
  const policyResources = resolveResourceOwnerPathResolution(policies, input.resourceOptions);
  const factResources = resolveResourceOwnerPathResolution(facts, input.resourceOptions);
  if (input.deferResourceFailuresToExecution !== true) {
    const failure = [...policyResources.failures.entries(), ...factResources.failures.entries()].toSorted(([left], [right]) => left.localeCompare(right))[0];
    if (failure !== undefined) {
      throw new Error(failure[1]);
    }
  }
  return { policies: policyResources.paths, facts: factResources.paths, policyFailures: policyResources.failures, factFailures: factResources.failures };
}
