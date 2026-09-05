// Deterministic final-policy planner. It consumes the loader roster, reviewed six-kind scope manifest,
// and the external ResourceHost population manifest without owning another registry or path predicate.
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type {
  PlannedPolicy,
  PolicyCommandRequest,
  PolicyPlanExecutionInput,
  PolicyPlanExecutionResult,
  PolicyPlannerInput,
  PolicyPlanningResult,
  PolicyRosterEntry,
  PolicySelector,
} from "../contract/policy-plan.ts";
import type { PolicyScopeResolution, PolicySemanticPath } from "../contract/policy-scope.ts";
import type { ResourceHostOptions } from "../contract/resource-host.ts";
import { parsePolicyCommand } from "./policy-command.ts";
import { runPolicyPass } from "./policy-pass.ts";
import { resolvePolicyScope } from "./policy-scope.ts";
import { isPolicySourceCandidate, policySourceCandidates } from "./policy-source-candidate.ts";
import { assertGatePolicyDescriptor, normalizePathSet } from "./policy-validation.ts";
import { populationIncludes, resolvePopulation } from "./population-resolver.ts";
import { canonicalResourceDeclarations, resolvePolicyResourcePaths } from "./resource-declaration.ts";

function misuse(message: string): PolicyPlanningResult {
  return { ok: false, exitCode: 3, message };
}

function toolError(message: string): PolicyPlanningResult {
  return { ok: false, exitCode: 2, message };
}

function rosterEntry(policy: GatePolicy): PolicyRosterEntry {
  return {
    id: policy.id,
    family: policy.family,
    authority: policy.authority,
    severity: policy.severity,
    workItem: policy.severity === "warning" ? policy.workItem : null,
    population: structuredClone(policy.population),
    analysis: policy.analysis,
    execution: policy.execution,
    resources: canonicalResourceDeclarations(policy.resources),
    message: policy.message,
    fix: policy.fix ?? null,
    proofCounts: { mustFlag: policy.mustFlag.length, mustPass: policy.mustPass.length },
  };
}

function validateCorpus(input: Pick<PolicyPlannerInput, "corpus">): readonly GatePolicy[] {
  if (!Array.isArray(input.corpus.gates) || input.corpus.gates.length === 0) {
    throw new Error("policy planner received an empty loaded corpus");
  }
  const ids = new Set<string>();
  for (const policy of input.corpus.gates) {
    if (!isDefinedGatePolicy(policy)) {
      throw new Error("policy planner accepts only policies branded by defineGate");
    }
    assertGatePolicyDescriptor(policy);
    if (ids.has(policy.id)) {
      throw new Error(`policy planner received duplicate policy id ${policy.id}`);
    }
    ids.add(policy.id);
  }
  const derivedFamilies = [...new Set(input.corpus.gates.map(({ family }) => family))].toSorted();
  if (JSON.stringify(derivedFamilies) !== JSON.stringify([...input.corpus.families].toSorted())) {
    throw new Error("policy planner corpus family receipt disagrees with loaded descriptors");
  }
  return [...input.corpus.gates].toSorted((left, right) => left.id.localeCompare(right.id));
}

function selectedPolicies(policies: readonly GatePolicy[], selector: PolicySelector): readonly GatePolicy[] | PolicyPlanningResult {
  if (selector.kind === "all") {
    return policies;
  }
  if (selector.names.length === 0) {
    return misuse(`${selector.kind} selection must not be empty`);
  }
  const duplicate = selector.names.toSorted().find((name, index, names) => name === names[index - 1]);
  if (duplicate !== undefined) {
    return misuse(`duplicate ${selector.kind} selection ${JSON.stringify(duplicate)}`);
  }
  const available = new Set(policies.map((policy) => (selector.kind === "check" ? policy.id : policy.family)));
  const unknown = selector.names.filter((name) => !available.has(name)).toSorted();
  if (unknown.length > 0) {
    return misuse(`unknown ${selector.kind} selection(s): ${unknown.join(", ")}`);
  }
  const requested = new Set(selector.names);
  return policies.filter((policy) => requested.has(selector.kind === "check" ? policy.id : policy.family));
}

function isPlanningFailure(value: readonly GatePolicy[] | PolicyPlanningResult): value is PolicyPlanningResult {
  return !Array.isArray(value);
}

function inspection(request: Exclude<PolicyCommandRequest, { readonly mode: "run" }>, policies: readonly GatePolicy[]): PolicyPlanningResult {
  if (request.mode === "list") {
    return {
      ok: true,
      plan: {
        mode: "list",
        json: request.json,
        policies: policies.map(rosterEntry),
        families: [...new Set(policies.map(({ family }) => family))].toSorted(),
      },
    };
  }
  const selected = selectedPolicies(policies, request.selector);
  if (isPlanningFailure(selected)) {
    return selected;
  }
  return { ok: true, plan: { mode: "explain", json: request.json, selector: request.selector, policies: selected.map(rosterEntry) } };
}

function assertScopeMatches(request: Extract<PolicyCommandRequest, { readonly mode: "run" }>, scope: PolicyScopeResolution): void {
  if (JSON.stringify(request.scope) !== JSON.stringify(scope.request) || request.scope.kind !== scope.kind) {
    throw new Error("policy planner scope manifest does not match the parsed scope request");
  }
  const programIds = scope.programs.map(({ id }) => id);
  if (new Set(programIds).size !== programIds.length || scope.requestedProgramIds.some((id) => !programIds.includes(id))) {
    throw new Error("policy planner scope carries invalid compiler program membership");
  }
  const compilerFiles = new Set(scope.programs.flatMap(({ files }) => files));
  const unowned = scope.currentPaths.filter((path) => isPolicySourceCandidate(path) && !compilerFiles.has(path));
  if (unowned.length > 0) {
    throw new Error(`selected TypeScript paths have no compiler program membership: ${unowned.toSorted().join(", ")}`);
  }
}

function resourceManifests(input: PolicyPlannerInput, policies: readonly GatePolicy[]): ReadonlyMap<string, readonly string[]> {
  if (!policies.some((policy) => policy.resources.length > 0)) {
    return new Map();
  }
  if (input.resourceOptions === undefined) {
    throw new Error("policy resource planning requires ResourceHost options");
  }
  return resolvePolicyResourcePaths(policies, input.resourceOptions);
}

function explicitNone(policy: GatePolicy): boolean {
  return typeof policy.population === "object" && !Array.isArray(policy.population) && "of" in policy.population && policy.population.of === "none";
}

interface PlanOneInput {
  readonly policy: GatePolicy;
  readonly sourceCandidates: readonly string[];
  readonly requestedPaths: readonly string[] | null;
  readonly semanticPaths: readonly PolicySemanticPath[] | null;
  readonly currentPaths: ReadonlySet<string>;
  readonly resources: readonly string[];
}

function semanticSelectionTouchesPolicy(policy: GatePolicy, semanticPaths: readonly PolicySemanticPath[] | null, resources: readonly string[]): boolean {
  if (semanticPaths === null) {
    return true;
  }
  const resourceSet = new Set(resources);
  return semanticPaths.some((semantic) =>
    [semantic.path, ...(semantic.previousPath === null ? [] : [semantic.previousPath])].some(
      (path) => resourceSet.has(path) || (isPolicySourceCandidate(path) && populationIncludes(policy.population, path)),
    ),
  );
}

interface PlanModeInput {
  readonly policy: GatePolicy;
  readonly requestedPaths: readonly string[] | null;
  readonly semanticPaths: readonly PolicySemanticPath[] | null;
  readonly resources: readonly string[];
  readonly declaredCount: number;
  readonly effectiveCount: number;
}

function planMode({ policy, requestedPaths, semanticPaths, resources, declaredCount, effectiveCount }: PlanModeInput): Pick<PlannedPolicy, "mode" | "reason"> {
  if (requestedPaths !== null && effectiveCount === 0) {
    return policy.execution === "entire-population" && semanticSelectionTouchesPolicy(policy, semanticPaths, resources)
      ? { mode: "deferred", reason: "entire-population policy requires its complete declared population" }
      : { mode: "skipped", reason: "requested scope has an empty policy intersection" };
  }
  if (policy.execution === "entire-population" && effectiveCount < declaredCount) {
    return { mode: "deferred", reason: "entire-population policy requires its complete declared population" };
  }
  return { mode: "run", reason: null };
}

function planOne({ policy, sourceCandidates, requestedPaths, semanticPaths, currentPaths, resources }: PlanOneInput): PlannedPolicy {
  const declaredSourcePaths = resolvePopulation(policy.population, sourceCandidates).paths;
  if (policy.analysis !== "resource" && resources.length > 0) {
    throw new Error(`non-resource policy ${policy.id} received a resource population`);
  }
  if (policy.analysis === "resource" && resources.length === 0) {
    throw new Error(`resource policy ${policy.id} received an empty resource population`);
  }
  if (explicitNone(policy) && declaredSourcePaths.length > 0) {
    throw new Error(`resource-only policy ${policy.id} unexpectedly resolved source files`);
  }
  const effectiveSourcePaths = requestedPaths === null ? declaredSourcePaths : declaredSourcePaths.filter((path) => currentPaths.has(path));
  const effectiveResourcePaths = requestedPaths === null ? resources : resources.filter((path) => currentPaths.has(path));
  const declaredCount = declaredSourcePaths.length + resources.length;
  const effectiveCount = effectiveSourcePaths.length + effectiveResourcePaths.length;
  const { mode, reason } = planMode({ policy, requestedPaths, semanticPaths, resources, declaredCount, effectiveCount });
  return {
    policyId: policy.id,
    family: policy.family,
    mode,
    reason,
    population: {
      declaredSourcePaths,
      declaredResourcePaths: resources,
      requestedPaths,
      effectiveSourcePaths,
      effectiveResourcePaths,
    },
  };
}

function resourceRecord(selected: readonly GatePolicy[], resources: ReadonlyMap<string, readonly string[]>): Readonly<Record<string, readonly string[]>> {
  const entries: [string, readonly string[]][] = [];
  for (const policy of selected) {
    const paths = resources.get(policy.id);
    if (paths !== undefined) {
      entries.push([policy.id, paths]);
    }
  }
  return Object.fromEntries(entries);
}

function runPlan(
  input: PolicyPlannerInput,
  request: Extract<PolicyCommandRequest, { readonly mode: "run" }>,
  policies: readonly GatePolicy[],
): PolicyPlanningResult {
  const scope = input.scope;
  if (scope === undefined) {
    return toolError("policy run planning requires a resolved scope manifest");
  }
  assertScopeMatches(request, scope);
  const selected = selectedPolicies(policies, request.selector);
  if (isPlanningFailure(selected)) {
    return selected;
  }
  const resources = resourceManifests(input, selected);
  const sourceCandidates = policySourceCandidates(scope.programs.flatMap(({ files }) => files));
  const requestedPaths =
    scope.requestedPaths === null
      ? null
      : normalizePathSet(
          scope.requestedPaths.map(({ path }) => path),
          "requested policy path",
        );
  const currentPaths = new Set(scope.currentPaths);
  const planned = selected.map((policy) =>
    planOne({
      policy,
      sourceCandidates,
      requestedPaths,
      semanticPaths: scope.requestedPaths,
      currentPaths,
      resources: resources.get(policy.id) ?? [],
    }),
  );
  const deferred = planned.filter(({ mode }) => mode === "deferred").map(({ policyId }) => policyId);
  if (request.strictScope && deferred.length > 0) {
    return misuse(`strict scope refuses entire-population policies: ${deferred.join(", ")}`);
  }
  return {
    ok: true,
    plan: {
      mode: "run",
      tier: request.tier,
      scope: structuredClone(scope),
      selector: structuredClone(request.selector),
      strictScope: request.strictScope,
      failOnWarnings: request.failOnWarnings,
      json: request.json,
      policyIds: selected.map(({ id }) => id),
      policies: planned,
      programs: structuredClone(scope.programs),
      requestedProgramIds: [...scope.requestedProgramIds],
      requestedPaths: scope.requestedPaths === null ? null : structuredClone(scope.requestedPaths),
      resourcePathsByPolicy: resourceRecord(selected, resources),
    },
  };
}

export function planPolicyCommand(input: PolicyPlannerInput): PolicyPlanningResult {
  try {
    const policies = validateCorpus(input);
    return input.request.mode === "run" ? runPlan(input, input.request, policies) : inspection(input.request, policies);
  } catch (error) {
    return toolError(error instanceof Error ? error.message : String(error));
  }
}

/** Parse argv and resolve its six-kind scope before producing the single final-policy command plan. */
export function planPolicyArgv(
  root: string,
  argv: readonly string[],
  corpus: PolicyPlannerInput["corpus"],
  resourceOptions?: Omit<ResourceHostOptions, "root">,
): PolicyPlanningResult {
  const parsed = parsePolicyCommand(argv);
  if (!parsed.ok) {
    return parsed;
  }
  try {
    const scope = parsed.request.mode === "run" ? resolvePolicyScope(root, parsed.request.scope) : undefined;
    return planPolicyCommand({
      request: parsed.request,
      corpus,
      ...(scope === undefined ? {} : { scope }),
      resourceOptions: { root, ...resourceOptions },
    });
  } catch (error) {
    return toolError(error instanceof Error ? error.message : String(error));
  }
}

/** Map the completed dispatcher result onto the house 0/1/2 contract; argv/planning misuse is class 3. */
export function policyPassExitCode(result: PolicyPassResult): 0 | 1 | 2 {
  if (result.toolErrors.length > 0 || result.authority.toolErrors.length > 0) {
    return 2;
  }
  return result.authority.verdict.blocking > 0 ? 1 : 0;
}

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
}

/** Execute one validated plan through the production pass, including its bound ResourceHost seam. */
export function executePolicyPlan(input: PolicyPlanExecutionInput): PolicyPlanExecutionResult {
  try {
    const policies = executionPolicies(input);
    assertExecutionResourcePaths(input.plan);
    const requestedPaths = input.plan.scope.requestedPaths?.map(({ path }) => path);
    const pass = runPolicyPass({
      policies,
      root: input.root,
      project: input.project,
      ...(requestedPaths === undefined ? {} : { requestedPaths }),
      ownerPlansByPolicy: new Map(input.plan.policies.map(({ policyId, mode, reason, population }) => [policyId, { mode, reason, population }])),
      reviewedGrants: input.reviewedGrants,
      failOnWarnings: input.plan.failOnWarnings,
      ...(input.resourceOptions === undefined ? {} : { resourceOptions: input.resourceOptions }),
      ...(input.waiverFor === undefined ? {} : { waiverFor: input.waiverFor }),
      ...(input.reconcileOrdinary === undefined ? {} : { reconcileOrdinary: input.reconcileOrdinary }),
    });
    assertExecutedPopulations(input.plan, pass);
    return { ok: true, exitCode: policyPassExitCode(pass), plan: input.plan, pass };
  } catch (error) {
    return { ok: false, exitCode: 2, message: error instanceof Error ? error.message : String(error) };
  }
}
