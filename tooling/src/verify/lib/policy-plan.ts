// Deterministic final-policy planner. It consumes the loader roster, reviewed six-kind scope manifest,
// and the external ResourceHost population manifest without owning another registry or path predicate.
import type { GateFact } from "../contract/fact.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type {
  PlannedFact,
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
import { refuseSelection } from "./policy-selection.ts";
import { isPolicySourceCandidate, policySourceCandidates } from "./policy-source-candidate.ts";
import { assertGatePolicyDescriptor, normalizePathSet } from "./policy-validation.ts";
import { populationIncludes, resolvePopulation } from "./population-resolver.ts";
import { canonicalResourceDeclarations, resolveResourceOwnerPaths } from "./resource-declaration.ts";

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
    facts: policy.facts.map(({ id }) => id).toSorted(),
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
  const sorted = [...input.corpus.gates].toSorted((left, right) => left.id.localeCompare(right.id));
  factsForPolicies(sorted);
  return sorted;
}

/** The planner's view of the selection rule, which lives in `lib/policy-selection.ts` — one home, two doors:
 *  a refusal surfaces here as a planning misuse and on the mixed front door as a thrown `UsageError`. */
function selectedPolicies(policies: readonly GatePolicy[], selector: PolicySelector): readonly GatePolicy[] | PolicyPlanningResult {
  if (selector.kind === "all") {
    return policies;
  }
  const available = new Set(policies.map((policy) => (selector.kind === "check" ? policy.id : policy.family)));
  const refusal = refuseSelection(selector, available);
  if (refusal !== null) {
    return misuse(refusal);
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

function resourceManifests(
  input: PolicyPlannerInput,
  policies: readonly GatePolicy[],
  facts: readonly GateFact[],
): { readonly policies: ReadonlyMap<string, readonly string[]>; readonly facts: ReadonlyMap<string, readonly string[]> } {
  if (![...policies, ...facts].some((owner) => owner.resources.length > 0)) {
    return { policies: new Map(), facts: new Map() };
  }
  if (input.resourceOptions === undefined) {
    throw new Error("policy/fact resource planning requires ResourceHost options");
  }
  return {
    policies: resolveResourceOwnerPaths(policies, input.resourceOptions),
    facts: resolveResourceOwnerPaths(facts, input.resourceOptions),
  };
}

function explicitNone(owner: GatePolicy | GateFact): boolean {
  return typeof owner.population === "object" && !Array.isArray(owner.population) && "of" in owner.population && owner.population.of === "none";
}

function factsForPolicies(policies: readonly GatePolicy[]): readonly GateFact[] {
  const byId = new Map<string, GateFact>();
  for (const policy of policies) {
    for (const fact of policy.facts) {
      const existing = byId.get(fact.id);
      if (existing !== undefined && existing !== fact) {
        throw new Error(`selected policies import different fact descriptors with id ${fact.id}`);
      }
      byId.set(fact.id, fact);
    }
  }
  return [...byId.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

function planFact(fact: GateFact, sourceCandidates: readonly string[], resources: readonly string[]): PlannedFact {
  const declaredSourcePaths = resolvePopulation(fact.population, sourceCandidates).paths;
  if (fact.analysis !== "resource" && resources.length > 0) {
    throw new Error(`non-resource fact ${fact.id} received a resource population`);
  }
  if (fact.analysis === "resource" && resources.length === 0) {
    throw new Error(`resource fact ${fact.id} received an empty resource population`);
  }
  if (explicitNone(fact) && declaredSourcePaths.length > 0) {
    throw new Error(`resource-only fact ${fact.id} unexpectedly resolved source files`);
  }
  if (declaredSourcePaths.length + resources.length === 0) {
    throw new Error(`fact ${fact.id} resolved an empty declared population`);
  }
  return {
    factId: fact.id,
    population: {
      declaredSourcePaths,
      declaredResourcePaths: resources,
      requestedPaths: null,
      effectiveSourcePaths: declaredSourcePaths,
      effectiveResourcePaths: resources,
    },
  };
}

interface PlanOneInput {
  readonly policy: GatePolicy;
  readonly sourceCandidates: readonly string[];
  readonly requestedPaths: readonly string[] | null;
  readonly semanticPaths: readonly PolicySemanticPath[] | null;
  readonly currentPaths: ReadonlySet<string>;
  readonly resources: readonly string[];
  readonly facts: readonly PlannedFact[];
}

function semanticSelectionTouchesPolicy(
  policy: GatePolicy,
  semanticPaths: readonly PolicySemanticPath[] | null,
  resources: readonly string[],
  factPaths: ReadonlySet<string>,
): boolean {
  if (semanticPaths === null) {
    return true;
  }
  const resourceSet = new Set(resources);
  return semanticPaths.some((semantic) =>
    [semantic.path, ...(semantic.previousPath === null ? [] : [semantic.previousPath])].some(
      (path) => resourceSet.has(path) || factPaths.has(path) || (isPolicySourceCandidate(path) && populationIncludes(policy.population, path)),
    ),
  );
}

interface PlanModeInput {
  readonly policy: GatePolicy;
  readonly requestedPaths: readonly string[] | null;
  readonly semanticPaths: readonly PolicySemanticPath[] | null;
  readonly resources: readonly string[];
  readonly factPaths: ReadonlySet<string>;
  readonly declaredCount: number;
  readonly effectiveCount: number;
}

function planMode({
  policy,
  requestedPaths,
  semanticPaths,
  resources,
  factPaths,
  declaredCount,
  effectiveCount,
}: PlanModeInput): Pick<PlannedPolicy, "mode" | "reason"> {
  if (requestedPaths !== null && effectiveCount === 0) {
    return policy.execution === "entire-population" && semanticSelectionTouchesPolicy(policy, semanticPaths, resources, factPaths)
      ? { mode: "deferred", reason: "entire-population policy requires its complete declared population" }
      : { mode: "skipped", reason: "requested scope has an empty policy intersection" };
  }
  if (policy.execution === "entire-population" && effectiveCount < declaredCount) {
    return { mode: "deferred", reason: "entire-population policy requires its complete declared population" };
  }
  return { mode: "run", reason: null };
}

function planOne({ policy, sourceCandidates, requestedPaths, semanticPaths, currentPaths, resources, facts }: PlanOneInput): PlannedPolicy {
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
  const factPaths = new Set(facts.flatMap(({ population }) => [...population.declaredSourcePaths, ...population.declaredResourcePaths]));
  const requiredPaths = new Set([...declaredSourcePaths, ...resources, ...factPaths]);
  const effectiveRequiredPaths = requestedPaths === null ? requiredPaths : new Set([...requiredPaths].filter((path) => currentPaths.has(path)));
  const { mode, reason } = planMode({
    policy,
    requestedPaths,
    semanticPaths,
    resources,
    factPaths,
    declaredCount: requiredPaths.size,
    effectiveCount: effectiveRequiredPaths.size,
  });
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

function resourceRecord(
  selected: readonly { readonly id: string }[],
  resources: ReadonlyMap<string, readonly string[]>,
): Readonly<Record<string, readonly string[]>> {
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
  const selectedFacts = factsForPolicies(selected);
  const resources = resourceManifests(input, selected, selectedFacts);
  const sourceCandidates = policySourceCandidates(scope.programs.flatMap(({ files }) => files));
  const plannedFacts = selectedFacts.map((fact) => planFact(fact, sourceCandidates, resources.facts.get(fact.id) ?? []));
  const factPlansById = new Map(plannedFacts.map((fact) => [fact.factId, fact]));
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
      resources: resources.policies.get(policy.id) ?? [],
      facts: policy.facts.map((fact) => {
        const factPlan = factPlansById.get(fact.id);
        if (factPlan === undefined) {
          throw new Error(`policy ${policy.id} has no planned fact ${fact.id}`);
        }
        return factPlan;
      }),
    }),
  );
  const deferred = planned.filter(({ mode }) => mode === "deferred").map(({ policyId }) => policyId);
  if (request.strictScope && deferred.length > 0) {
    return misuse(`strict scope refuses entire-population policies: ${deferred.join(", ")}`);
  }
  const runningFactIds = new Set(
    planned.flatMap((row) => (row.mode === "run" ? (selected.find(({ id }) => id === row.policyId)?.facts.map(({ id }) => id) ?? []) : [])),
  );
  const facts = plannedFacts.filter(({ factId }) => runningFactIds.has(factId));
  const factOwners = selectedFacts.filter(({ id }) => runningFactIds.has(id));
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
      facts,
      programs: structuredClone(scope.programs),
      requestedProgramIds: [...scope.requestedProgramIds],
      requestedPaths: scope.requestedPaths === null ? null : structuredClone(scope.requestedPaths),
      resourcePathsByPolicy: resourceRecord(selected, resources.policies),
      resourcePathsByFact: resourceRecord(factOwners, resources.facts),
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
  if (result.factErrors.length > 0 || result.toolErrors.length > 0 || result.authority.toolErrors.length > 0) {
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
