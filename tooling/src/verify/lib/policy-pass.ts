// Final policy dispatcher: resolve once, create once, walk once, then centrally reconcile authority.
import { performance } from "node:perf_hooks";
import { beginReferencePass, endReferencePass } from "@orb/tooling/floor/code-facts/reference-fact";
import type { TypeChecker } from "ts-morph";
import type { GateFactToolError, PolicyFactValueRegistry, PolicyPassInput, PolicyPassResult, PolicyToolError } from "../contract/policy-pass.ts";
import { GATE_FACT_PHASES, POLICY_PHASES } from "../contract/policy-pass.ts";
import { createResourceHost } from "../ops/resource-host.ts";
import { coordinateGateAuthority } from "./gate-authority.ts";
import { assertInvocationPolicies, assertOwnerPlans, assertSelectedPoliciesAreLoaded } from "./policy-pass-admission.ts";
import {
  authorityOwnerResult,
  evaluateRuns,
  factResult,
  finishFactRuns,
  ordinaryWaiverAcquisition,
  ownerResult,
  withholdFactDependents,
} from "./policy-pass-receipts.ts";
import { resolveFactRuns, resolveRuns, selectedFacts } from "./policy-pass-resolve.ts";
import type { FactControl } from "./policy-pass-types.ts";
import { ceilMs } from "./policy-pass-types.ts";
import { createFactRuns, createRuns, prepareRuns, walkRuns } from "./policy-pass-walk.ts";

/** Run every selected policy with invocation-local state, then coordinate all authority centrally. */
export function runPolicyPass(input: PolicyPassInput): PolicyPassResult {
  if (input.applicationPaths !== undefined && input.applicationPaths.length === 0) {
    throw new Error("application policy execution requires a complete nonempty subject population");
  }
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
  const needsNative =
    runs.some((run) => run.owner.status === "success" && run.policy.analysis !== "syntax") ||
    factRuns.some((run) => run.status === "success" && run.fact.analysis !== "syntax");
  using nativeTypes = needsNative ? input.nativeTypeFacts?.() : undefined;
  const nativeOptions = nativeTypes === undefined ? {} : { nativeTypes };
  let checker: TypeChecker | undefined;
  const sharedChecker = (): TypeChecker => {
    checker ??= input.project.getTypeChecker();
    return checker;
  };
  // The ONE path resolution: every owner context looks its files up here instead of re-deriving them per visit.
  const paths: ReadonlyMap<object, string> = new Map([...sourceFiles].map(([path, sourceFile]) => [sourceFile.compilerNode, path]));
  createFactRuns({ runs: factRuns, policyRuns: runs, paths, resources, checker: sharedChecker, ...nativeOptions, control: factControl });
  createRuns({
    runs,
    paths,
    resources,
    checker: sharedChecker,
    ...nativeOptions,
    errors: toolErrors,
    factValues,
    ...(input.applicationPaths === undefined ? {} : { applicationPaths: input.applicationPaths }),
  });
  // The shared readers' per-file write caches live for exactly this pass (walk + evaluate both query them).
  beginReferencePass();
  try {
    walkRuns({ runs, factRuns, sourceFiles, errors: toolErrors, factControl });
    prepareRuns({ runs, factRuns, errors: toolErrors, factControl });
    nativeTypes?.seal(
      new Set([
        ...runs.filter((run) => run.owner.status === "success").map((run) => run.policy.id),
        ...factRuns.filter((run) => run.status === "success").map((run) => run.fact.id),
      ]),
    );
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
    {
      carriers: resourceInvocation.ordinaryWaiverCarriers,
      ...(input.applicationPaths === undefined ? {} : { applicationPaths: new Set(input.applicationPaths) }),
    },
  );
  const authority = coordinateGateAuthority({
    knownPolicies: input.knownPolicies.map(({ id, authority: policyAuthority, severity }) => ({ id, authority: policyAuthority, severity })),
    selectedPolicies: input.policies.map(({ id, authority: policyAuthority, severity }) => ({ id, authority: policyAuthority, severity })),
    ordinaryWaiverSources: waiverCarriers.sources,
    ownerResults: policies.map(authorityOwnerResult),
    reviewedGrants: input.reviewedGrants,
    // The selection fixes the judged population; no caller can name one its pass did not walk.
    ...(input.waiverBudget === undefined
      ? {}
      : { waiverBudget: { population: input.applicationPaths === undefined ? "repository" : "application", budget: input.waiverBudget } }),
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
