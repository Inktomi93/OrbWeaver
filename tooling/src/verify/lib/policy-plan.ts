// Deterministic final-policy planner. It consumes the loader roster, reviewed six-kind scope manifest,
// and the external ResourceHost population manifest without owning another registry or path predicate.
// Execution of a validated plan is `policy-plan-execute.ts` (split out at the size cap 2026-09-18); it
// consumes this module's corpus validation and exit mapping.
import type { GateFact } from "../contract/fact.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { PolicySelectionDisposition } from "../contract/policy-effective-population.ts";
import type { PolicyPassResult } from "../contract/policy-pass.ts";
import type {
  PlannedFact,
  PlannedPolicy,
  PolicyCommandRequest,
  PolicyPlannerInput,
  PolicyPlanningResult,
  PolicyRosterEntry,
  PolicySelector,
} from "../contract/policy-plan.ts";
import type { PolicyScopeResolution, PolicySemanticPath } from "../contract/policy-scope.ts";
import { isGateResourceUnpopulatedKind } from "../contract/resource-declaration.ts";
import type { ResourceHostOptions } from "../contract/resource-host.ts";
import { parsePolicyCommand } from "./policy-command.ts";
import { resolveEffectivePopulation } from "./policy-effective-population.ts";
import { planSourceCandidates } from "./policy-plan-source-candidates.ts";
import { policyProofArmCounts } from "./policy-proof-rows.ts";
import { resolvePolicyScope } from "./policy-scope.ts";
import { refuseSelection } from "./policy-selection.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";
import { assertGatePolicyDescriptor, normalizePathSet } from "./policy-validation.ts";
import { populationIncludes, resolvePopulation } from "./population-resolver.ts";
import { canonicalResourceDeclarations, resolveResourceOwnerPathResolution } from "./resource-declaration.ts";

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
    proofCounts: policyProofArmCounts(policy),
  };
}

export function validateCorpus(input: Pick<PolicyPlannerInput, "corpus">): readonly GatePolicy[] {
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
  if (unowned.length > 0 && scope.inventory.source !== "workspace") {
    throw new Error(`selected TypeScript paths have no compiler program membership: ${unowned.toSorted().join(", ")}`);
  }
}

function resourceManifests(
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

function explicitNone(owner: GatePolicy | GateFact): boolean {
  return typeof owner.population === "object" && !Array.isArray(owner.population) && "of" in owner.population && owner.population.of === "none";
}

/** A resource owner may legitimately publish no authored path when every missing path is explained by the
 *  resource contract's named unpopulated axis. The declaration is still acquired and receipted by the
 *  ResourceHost during execution; only its authored-path contribution is empty. */
function permitsEmptyResourcePaths(owner: GatePolicy | GateFact): boolean {
  return owner.resources.length > 0 && owner.resources.every(({ kind }) => isGateResourceUnpopulatedKind(kind));
}

export function factsForPolicies(policies: readonly GatePolicy[]): readonly GateFact[] {
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

function planFact(fact: GateFact, sourceCandidates: readonly string[], resources: readonly string[], resourceFailure: string | undefined): PlannedFact {
  const declaredSourcePaths = resolvePopulation(fact.population, sourceCandidates).paths;
  if (fact.analysis !== "resource" && resources.length > 0) {
    throw new Error(`non-resource fact ${fact.id} received a resource population`);
  }
  if (fact.analysis === "resource" && resources.length === 0 && !permitsEmptyResourcePaths(fact) && resourceFailure === undefined) {
    throw new Error(`resource fact ${fact.id} received an empty resource population`);
  }
  if (explicitNone(fact) && declaredSourcePaths.length > 0) {
    throw new Error(`resource-only fact ${fact.id} unexpectedly resolved source files`);
  }
  if (declaredSourcePaths.length + resources.length === 0 && !permitsEmptyResourcePaths(fact) && resourceFailure === undefined) {
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
  readonly resourceFailure: string | undefined;
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

const DEFERRED_REASON = "entire-population policy requires its complete declared population";

interface PlanModeInput {
  readonly policy: GatePolicy;
  readonly disposition: PolicySelectionDisposition;
  readonly semanticPaths: readonly PolicySemanticPath[] | null;
  readonly resources: readonly string[];
  readonly factPaths: ReadonlySet<string>;
}

/** The planner's only selection judgement of its own: which of the two `not-applicable` dispositions an
 *  entire-population policy gets when the scope reaches NONE of its declared paths. A DELETED or RENAMED
 *  identity is not in `currentPaths` and so cannot be selected, but it did name this policy's population —
 *  that is a deferral (the whole run owes the verdict), not a skip. The dispatcher cannot make this call (it
 *  never sees the semantic statuses) and does not have to: `applyOwnerPlan` carries the plan's reason onto a
 *  dispatcher owner that is already `not-applicable` for the emptier reason. */
function planMode({ policy, disposition, semanticPaths, resources, factPaths }: PlanModeInput): Pick<PlannedPolicy, "mode" | "reason"> {
  if (disposition === "run") {
    return { mode: "run", reason: null };
  }
  if (disposition === "deferred") {
    return { mode: "deferred", reason: DEFERRED_REASON };
  }
  return policy.execution === "entire-population" && semanticSelectionTouchesPolicy(policy, semanticPaths, resources, factPaths)
    ? { mode: "deferred", reason: DEFERRED_REASON }
    : { mode: "skipped", reason: "requested scope has an empty policy intersection" };
}

function planOne({ policy, sourceCandidates, requestedPaths, semanticPaths, currentPaths, resources, resourceFailure, facts }: PlanOneInput): PlannedPolicy {
  const declaredSourcePaths = resolvePopulation(policy.population, sourceCandidates).paths;
  if (policy.analysis !== "resource" && resources.length > 0) {
    throw new Error(`non-resource policy ${policy.id} received a resource population`);
  }
  if (policy.analysis === "resource" && resources.length === 0 && !permitsEmptyResourcePaths(policy) && resourceFailure === undefined) {
    throw new Error(`resource policy ${policy.id} received an empty resource population`);
  }
  if (explicitNone(policy) && declaredSourcePaths.length > 0) {
    throw new Error(`resource-only policy ${policy.id} unexpectedly resolved source files`);
  }
  const factPaths = new Set(facts.flatMap(({ population }) => [...population.declaredSourcePaths, ...population.declaredResourcePaths]));
  // THE ONE SELECTION CALCULATION (#2309), shared verbatim with the dispatcher. `current` is `currentPaths`
  // here because these declared paths come from the SCOPE MANIFEST's program membership, which still lists a
  // deleted file — see `PolicyRequestedSelection`.
  const selection = resolveEffectivePopulation({
    execution: policy.execution,
    declaredSourcePaths,
    declaredResourcePaths: resources,
    dependencyPaths: [...factPaths],
    requested: requestedPaths === null ? null : { identity: requestedPaths, current: currentPaths },
  });
  const { mode, reason } = planMode({ policy, disposition: selection.disposition, semanticPaths, resources, factPaths });
  return { policyId: policy.id, family: policy.family, mode, reason, population: selection.population };
}

function resourceRecord(
  selected: readonly { readonly id: string }[],
  resources: ReadonlyMap<string, readonly string[]>,
): Readonly<Record<string, readonly string[]>> {
  const entries: [string, readonly string[]][] = [];
  for (const policy of selected) {
    const paths = resources.get(policy.id);
    if (paths !== undefined && paths.length > 0) {
      entries.push([policy.id, paths]);
    }
  }
  return Object.fromEntries(entries);
}

function failureRecord(selected: readonly { readonly id: string }[], failures: ReadonlyMap<string, string>): Readonly<Record<string, string>> {
  return Object.fromEntries(selected.flatMap(({ id }) => (failures.has(id) ? [[id, failures.get(id) as string]] : [])));
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
  const sourceCandidates = planSourceCandidates(input, scope);
  const plannedFacts = selectedFacts.map((fact) => planFact(fact, sourceCandidates, resources.facts.get(fact.id) ?? [], resources.factFailures.get(fact.id)));
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
      resourceFailure: resources.policyFailures.get(policy.id),
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
      resourceFailuresByPolicy: failureRecord(selected, resources.policyFailures),
      resourceFailuresByFact: failureRecord(factOwners, resources.factFailures),
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
export interface PolicyArgvOptions extends Omit<ResourceHostOptions, "root"> {
  /** Exact files from the structure pass's own workspace, consulted only for whole scope at a standalone
   *  non-Git fixture root. A real repository always retains its Git-authored inventory. */
  readonly wholeWorkspacePaths?: () => readonly string[];
  /** Lazy so list/explain and parse refusals do not build the execution Project. */
  readonly executionWorkspacePaths?: () => readonly string[];
  readonly deferResourceFailuresToExecution?: boolean;
}

export function planPolicyArgv(
  root: string,
  argv: readonly string[],
  corpus: PolicyPlannerInput["corpus"],
  options: PolicyArgvOptions = {},
): PolicyPlanningResult {
  const parsed = parsePolicyCommand(argv);
  if (!parsed.ok) {
    return parsed;
  }
  try {
    const { wholeWorkspacePaths, executionWorkspacePaths, deferResourceFailuresToExecution, ...resourceOptions } = options;
    const scope =
      parsed.request.mode === "run"
        ? resolvePolicyScope(root, parsed.request.scope, wholeWorkspacePaths === undefined ? {} : { wholeWorkspacePaths })
        : undefined;
    return planPolicyCommand({
      request: parsed.request,
      corpus,
      ...(scope === undefined ? {} : { scope }),
      resourceOptions: { root, ...resourceOptions },
      ...(parsed.request.mode === "run" && executionWorkspacePaths !== undefined ? { executionWorkspacePaths: executionWorkspacePaths() } : {}),
      ...(deferResourceFailuresToExecution === undefined ? {} : { deferResourceFailuresToExecution }),
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
