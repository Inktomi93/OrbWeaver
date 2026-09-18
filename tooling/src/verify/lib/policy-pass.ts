// Final policy dispatcher: resolve once, create once, walk once, then centrally reconcile authority.
import { performance } from "node:perf_hooks";
import { beginReferencePass, endReferencePass } from "@orb/tooling/_shared/reference-fact";
import type { TypeChecker } from "ts-morph";
import type { GateFactToolError, PolicyFactValueRegistry, PolicyPassInput, PolicyPassResult, PolicyToolError } from "../contract/policy-pass.ts";
import { GATE_FACT_PHASES, POLICY_PHASES } from "../contract/policy-pass.ts";
import { createResourceHost } from "../ops/resource-host.ts";
import { coordinateGateAuthority } from "./gate-authority.ts";
import { evaluateRuns, factResult, finishFactRuns, ordinaryWaiverAcquisition, ownerResult, withholdFactDependents } from "./policy-pass-receipts.ts";
import {
  assertInvocationPolicies,
  assertOwnerPlans,
  assertSelectedPoliciesAreLoaded,
  resolveFactRuns,
  resolveRuns,
  selectedFacts,
} from "./policy-pass-resolve.ts";
import type { FactControl } from "./policy-pass-types.ts";
import { ceilMs } from "./policy-pass-types.ts";
import { createFactRuns, createRuns, walkRuns } from "./policy-pass-walk.ts";

/** Run every selected policy with invocation-local state, then coordinate all authority centrally. */
export function runPolicyPass(input: PolicyPassInput): PolicyPassResult {
  assertInvocationPolicies(input.knownPolicies);
  assertInvocationPolicies(input.policies);
  assertSelectedPoliciesAreLoaded(input.knownPolicies, input.policies);
  assertOwnerPlans(input);
  const started = performance.now();
  const toolErrors: PolicyToolError[] = [];
  const factErrors: GateFactToolError[] = [];
  const resourceInvocation = createResourceHost({ ...input.resourceOptions, root: input.root });
  const resources = resourceInvocation.host;
  const { runs, sourceFiles } = resolveRuns(input, resources, toolErrors);
  const factValues: PolicyFactValueRegistry = new Map();
  const factControl = { errors: factErrors, values: factValues } satisfies FactControl;
  const factRuns = resolveFactRuns({ facts: selectedFacts(runs), sourceFiles, resources, control: factControl });
  let checker: TypeChecker | undefined;
  const sharedChecker = (): TypeChecker => {
    checker ??= input.project.getTypeChecker();
    return checker;
  };
  // The ONE path resolution: every owner context looks its files up here instead of re-deriving them per visit.
  const paths: ReadonlyMap<object, string> = new Map([...sourceFiles].map(([path, sourceFile]) => [sourceFile.compilerNode, path]));
  createFactRuns({ runs: factRuns, paths, resources, checker: sharedChecker, control: factControl });
  createRuns({ runs, paths, resources, checker: sharedChecker, errors: toolErrors, factValues });
  // The shared readers' per-file write caches live for exactly this pass (walk + evaluate both query them).
  beginReferencePass();
  try {
    walkRuns({ runs, factRuns, sourceFiles, errors: toolErrors, factControl });
    finishFactRuns(factRuns, factControl);
    withholdFactDependents(runs, toolErrors, factValues);
    evaluateRuns(runs, toolErrors);
  } finally {
    endReferencePass();
  }
  const facts = factRuns.map(factResult).toSorted((left, right) => left.id.localeCompare(right.id));
  const policies = runs.map(ownerResult).toSorted((left, right) => left.id.localeCompare(right.id));
  const waiverCarriers = ordinaryWaiverAcquisition(
    policies,
    new Map(input.policies.map(({ id, authority: policyAuthority }) => [id, policyAuthority])),
    sourceFiles,
    resourceInvocation.ordinaryWaiverCarriers,
  );
  const authority = coordinateGateAuthority({
    knownPolicies: input.knownPolicies.map(({ id, authority: policyAuthority, severity }) => ({ id, authority: policyAuthority, severity })),
    selectedPolicies: input.policies.map(({ id, authority: policyAuthority, severity }) => ({ id, authority: policyAuthority, severity })),
    ordinaryWaiverSources: waiverCarriers.sources,
    ownerResults: policies.map(({ id, population, owner, findings }) => ({
      policyId: id,
      populationFiles: [...new Set([...population.effectiveSourcePaths, ...population.effectiveResourcePaths])].toSorted(),
      owner,
      findings,
    })),
    reviewedGrants: input.reviewedGrants,
    failOnWarnings: input.failOnWarnings,
  });
  const sortedErrors = toolErrors.toSorted(
    (left, right) =>
      left.policyId.localeCompare(right.policyId) ||
      POLICY_PHASES.indexOf(left.phase) - POLICY_PHASES.indexOf(right.phase) ||
      left.message.localeCompare(right.message),
  );
  const sortedFactErrors = factErrors.toSorted(
    (left, right) =>
      left.factId.localeCompare(right.factId) ||
      GATE_FACT_PHASES.indexOf(left.phase) - GATE_FACT_PHASES.indexOf(right.phase) ||
      left.message.localeCompare(right.message),
  );
  const policyMs = policies.reduce((sum, policyResult) => sum + policyResult.timing.totalMs, 0);
  const factMs = facts.reduce((sum, fact) => sum + fact.timing.totalMs, 0);
  return {
    facts,
    policies,
    factErrors: sortedFactErrors,
    toolErrors: sortedErrors,
    waiverCarrierRefusals: waiverCarriers.refusals,
    authority,
    timing: { totalMs: Math.max(ceilMs(performance.now() - started), policyMs + factMs), policyMs, factMs },
  };
}
