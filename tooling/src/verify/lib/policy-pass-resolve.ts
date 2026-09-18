// Population resolution: turns the invocation's policy/fact roster plus the workspace source files into
// PolicyRun/FactRun state with an effective population and an owner disposition — no visit/create dispatch.
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { SourceFile } from "ts-morph";
import type { GateFact } from "../contract/fact.ts";
import type { RawGateFinding } from "../contract/gate-authority.ts";
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type { PolicyRequestedSelection } from "../contract/policy-effective-population.ts";
import type { PolicyOwnerPlan, PolicyPassInput, PolicyToolError } from "../contract/policy-pass.ts";
import { POLICY_OWNER_PLAN_MODES, POLICY_PASS_REFUSALS } from "../contract/policy-pass.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import { resolveEffectivePopulation } from "./policy-effective-population.ts";
import type { FactControl, FactRun, PolicyRun } from "./policy-pass-types.ts";
import { charge, chargeFact, EMPTY_POPULATION, factPhaseRecord, markFactIncomplete, markIncomplete, phaseRecord } from "./policy-pass-types.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";
import { assertGateFactDescriptor, assertGatePolicyDescriptor, assertRepoPathIdentity, normalizePathSet } from "./policy-validation.ts";
import { resolvePopulation } from "./population-resolver.ts";
import { resolveResourceDeclarations } from "./resource-declaration.ts";

function sourcePath(root: string, sourceFile: SourceFile): string {
  const rel = relative(resolve(root), resolve(sourceFile.getFilePath()));
  const normalized = sep === "/" ? rel : rel.split(sep).join("/");
  if (normalized.length === 0 || isAbsolute(rel) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${POLICY_PASS_REFUSALS.sourceOutsidePolicyRoot}: ${sourceFile.getFilePath()}`);
  }
  assertRepoPathIdentity(normalized, "source file path");
  return normalized;
}

function isExplicitNone(owner: Pick<GatePolicy, "population"> | Pick<GateFact, "population">): boolean {
  const population = owner.population;
  return typeof population === "object" && !Array.isArray(population) && "of" in population && population.of === "none";
}

export function canonicalFindings(findings: readonly RawGateFinding[]): readonly RawGateFinding[] {
  return [...findings].toSorted(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      (left.token ?? "").localeCompare(right.token ?? "") ||
      (left.message ?? "").localeCompare(right.message ?? ""),
  );
}

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
    for (const fact of candidate.facts) {
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

/** WHICH DECLARATIONS SURVIVE INTO THE RUN'S DECLARED SET — and why there is no longer a filter here (#2309).
 *
 *  This position held `requestStaysDeclared`, whose rule was *"a narrowed scope that excludes a resource must
 *  also withdraw permission to read it"*: a populated request survived only if one of its paths was still in
 *  the effective resource population. THE RULING SURVIVES; ITS INPUT CHANGED. What a run may read is still
 *  exactly its effective resource population — `bindPolicyResources` fences both the declaration and every
 *  acquired path against it, unchanged — but a RUNNING owner's effective resource population is now its
 *  COMPLETE declaration (`lib/policy-effective-population.ts` rule 1), so the filter had become a tautology:
 *  `resolveResourceDeclarations` throws at the population phase on any non-ready or empty populated fact, so
 *  a surviving owner's every populated request resolved at least one path and every such path is in the set
 *  the filter tested against. An unpopulated kind was already admitted by name. It is deleted rather than
 *  left as decoration, and the fact side — which never narrowed at all (`resolveFactRuns` sets effective =
 *  declared) — had been running the same tautology since it was written.
 *
 *  What the narrowing COST while it was live, measured at `028e278ee`: both `baseui-derives-not-respells`
 *  siblings answered `[create] resource request json:baseui-manifest is undeclared` — withheld, exit 2 — on
 *  any `--changed` run naming a `@ui` seal, because the message this filter produces points at the
 *  descriptor, not at the filter. That misdirection is the reason it is documented here rather than removed
 *  silently. */

function newRun(policy: GatePolicy): PolicyRun {
  return {
    policy,
    timing: { phaseMs: phaseRecord() },
    findings: [],
    population: EMPTY_POPULATION,
    owner: { status: "incomplete", population: "incomplete", reason: POLICY_PASS_REFUSALS.populationUnresolved },
    files: [],
    effectivePathSet: new Set(),
    hooks: undefined,
    receipts: [],
    finishReceipts: undefined,
    unconsumedFacts: undefined,
    unconsumedResources: undefined,
    unconsumedResourceRequests: undefined,
    resourceRequests: [],
  };
}

function newFactRun(fact: GateFact): FactRun {
  return {
    fact,
    timing: { phaseMs: factPhaseRecord() },
    population: EMPTY_POPULATION,
    status: "incomplete",
    error: "population has not resolved",
    files: [],
    effectivePathSet: new Set(),
    hooks: undefined,
    receipts: [],
    finishReceipts: undefined,
    unconsumedResources: undefined,
    unconsumedResourceRequests: undefined,
    resourceRequests: [],
  };
}

interface ResolutionInput {
  readonly run: PolicyRun;
  readonly candidates: readonly string[];
  readonly sourceFiles: ReadonlyMap<string, SourceFile>;
  readonly requested: PolicyRequestedSelection | null;
  readonly resources: readonly string[];
  readonly dependencyPaths: readonly string[];
}

function resolveRun({ run, candidates, sourceFiles, requested, resources, dependencyPaths }: ResolutionInput): void {
  const declared = resolvePopulation(run.policy.population, candidates).paths;
  if (run.policy.analysis !== "resource" && resources.length > 0) {
    throw new Error(`non-resource policy ${run.policy.id} ${POLICY_PASS_REFUSALS.nonResourceReceivedResources}`);
  }
  if (isExplicitNone(run.policy) && resources.length === 0) {
    throw new Error(`resource-only policy ${run.policy.id} ${POLICY_PASS_REFUSALS.resourceOnlyNoPaths}`);
  }
  // THE ONE SELECTION CALCULATION (#2309), shared verbatim with the planner: an input is never narrowed, a
  // changed input reselects every subject, and applicability stays the raw scope intersection.
  const { population, disposition } = resolveEffectivePopulation({
    execution: run.policy.execution,
    declaredSourcePaths: declared,
    declaredResourcePaths: resources,
    dependencyPaths,
    requested,
  });
  run.population = population;
  run.files = population.effectiveSourcePaths.map((path) => {
    const sourceFile = sourceFiles.get(path);
    if (sourceFile === undefined) {
      throw new Error(`resolved source population path has no SourceFile: ${path}`);
    }
    return sourceFile;
  });
  run.effectivePathSet = new Set([...population.effectiveSourcePaths, ...population.effectiveResourcePaths]);
  if (disposition === "empty-intersection") {
    run.owner = { status: "not-applicable", population: "complete", reason: POLICY_PASS_REFUSALS.emptyIntersection };
  } else if (disposition === "deferred") {
    run.owner = { status: "not-applicable", population: "complete", reason: POLICY_PASS_REFUSALS.entireDeferred };
  } else {
    run.owner = { status: "success", population: "complete" };
  }
}

function applyOwnerPlan(run: PolicyRun, plan: PolicyOwnerPlan): void {
  if (JSON.stringify(plan.population) !== JSON.stringify(run.population)) {
    throw new Error(`planned population disagrees with dispatcher resolution for ${run.policy.id}`);
  }
  if (plan.mode === "run") {
    if (run.owner.status !== "success") {
      throw new Error(`planned runnable policy resolved ${run.owner.status}: ${run.policy.id}`);
    }
    return;
  }
  if (run.owner.status === "success" || plan.reason === null) {
    throw new Error(`planned ${plan.mode} policy disagrees with dispatcher applicability: ${run.policy.id}`);
  }
  run.owner = { status: "not-applicable", population: "complete", reason: plan.reason };
}

export function assertOwnerPlans(input: PolicyPassInput): void {
  const plans = input.ownerPlansByPolicy;
  if (plans === undefined) {
    return;
  }
  if (!(plans instanceof Map)) {
    throw new Error("runPolicyPass owner plans must be a Map");
  }
  const expected = input.policies.map(({ id }) => id).toSorted();
  const actual = [...plans.keys()].toSorted();
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

/** A consumed fact's DECLARED population, per fact id — the dependency half of the shared selection input.
 *
 *  It is resolved here rather than read off `resolveFactRuns`, which runs one phase later and only over the
 *  facts of already-successful owners: the selection that decides which owners succeed cannot depend on it.
 *  A fact whose own population will not resolve contributes NO dependency path and is not reported here — its
 *  `FactRun` raises that refusal at its own population phase and `withholdFactDependents` withholds every
 *  consumer, so swallowing it moves no verdict and keeps the error attributed to the fact rather than to a
 *  policy that merely declared it. */
function factDependencyPaths(policies: readonly GatePolicy[], candidates: readonly string[], resources: ResourceHost): ReadonlyMap<string, readonly string[]> {
  const byId = new Map<string, readonly string[]>();
  for (const fact of policies.flatMap(({ facts }) => facts)) {
    if (byId.has(fact.id)) {
      continue;
    }
    // @orb-waive caught-failure-ownership(catch): fact population resolution: on failure the fact gets an empty population and the run continues; downstream gates see EMPTY_POPULATION, not silence
    try {
      byId.set(fact.id, [...resolvePopulation(fact.population, candidates).paths, ...resolveResourceDeclarations(resources, fact.resources)]);
    } catch {
      byId.set(fact.id, []);
    }
  }
  return byId;
}

export function resolveRuns(
  input: PolicyPassInput,
  resources: ResourceHost,
  errors: PolicyToolError[],
): { readonly runs: PolicyRun[]; readonly sourceFiles: ReadonlyMap<string, SourceFile> } {
  const sourceFiles = new Map<string, SourceFile>();
  for (const sourceFile of input.project.getSourceFiles()) {
    const path = sourcePath(input.root, sourceFile);
    if (!isPolicySourceCandidate(path)) {
      continue;
    }
    if (sourceFiles.has(path)) {
      throw new Error(`workspace contains duplicate source path ${path}`);
    }
    sourceFiles.set(path, sourceFile);
  }
  const candidates = [...sourceFiles.keys()].toSorted();
  const requestedPaths = input.requestedPaths === undefined ? null : normalizePathSet(input.requestedPaths, "requested path");
  // The dispatcher's `current` is the identity set itself: `declared` below is resolved from the Project's own
  // source files and from the ResourceHost, so a deleted identity is already absent from both and cannot
  // survive the intersection. The planner, whose declared source paths come from the SCOPE MANIFEST's program
  // membership (which still lists a deleted file), must filter — see `PolicyRequestedSelection`.
  const requested = requestedPaths === null ? null : { identity: requestedPaths, current: new Set(requestedPaths) };
  const dependencies = factDependencyPaths(input.policies, candidates, resources);
  const runs = input.policies.map(newRun);
  for (const run of runs) {
    // @orb-waive caught-failure-ownership(error): policy population resolution: markIncomplete converts error to a structured PolicyToolError; the run reports tool-error status with EMPTY_POPULATION
    try {
      charge(run.timing, "population", () => {
        const declaredResources = resolveResourceDeclarations(resources, run.policy.resources);
        const dependencyPaths = run.policy.facts.flatMap(({ id }) => dependencies.get(id) ?? []);
        resolveRun({ run, candidates, sourceFiles, requested, resources: declaredResources, dependencyPaths });
        run.resourceRequests = run.policy.resources;
        const ownerPlan = input.ownerPlansByPolicy?.get(run.policy.id);
        if (ownerPlan !== undefined) {
          applyOwnerPlan(run, ownerPlan);
        }
      });
    } catch (error) {
      markIncomplete(run, "population", error, errors);
      run.population = { ...EMPTY_POPULATION, requestedPaths };
    }
  }
  return { runs, sourceFiles };
}

export function selectedFacts(runs: readonly PolicyRun[]): readonly GateFact[] {
  const byId = new Map<string, GateFact>();
  for (const selected of runs.filter(({ owner }) => owner.status === "success").map(({ policy: descriptor }) => descriptor)) {
    for (const fact of selected.facts) {
      assertGateFactDescriptor(fact);
      const existing = byId.get(fact.id);
      if (existing !== undefined && existing !== fact) {
        throw new Error(`selected policies import different fact descriptors with id ${fact.id}`);
      }
      byId.set(fact.id, fact);
    }
  }
  return [...byId.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

interface ResolveFactRunsInput {
  readonly facts: readonly GateFact[];
  readonly sourceFiles: ReadonlyMap<string, SourceFile>;
  readonly resources: ResourceHost;
  readonly control: FactControl;
}

export function resolveFactRuns({ facts, sourceFiles, resources, control }: ResolveFactRunsInput): FactRun[] {
  const candidates = [...sourceFiles.keys()].toSorted();
  return facts.map((fact) => {
    const run = newFactRun(fact);
    control.values.set(fact, { status: "pending" });
    // @orb-waive caught-failure-ownership(error): fact population resolution: markFactIncomplete converts error to a structured FactToolError; the run reports tool-error status with EMPTY_POPULATION
    try {
      chargeFact(run.timing, "population", () => {
        const declaredSourcePaths = resolvePopulation(fact.population, candidates).paths;
        const declaredResourcePaths = resolveResourceDeclarations(resources, fact.resources);
        if (isExplicitNone(fact) && declaredResourcePaths.length === 0) {
          throw new Error(`resource-only fact ${fact.id} ${POLICY_PASS_REFUSALS.resourceOnlyNoPaths}`);
        }
        if (declaredSourcePaths.length + declaredResourcePaths.length === 0) {
          throw new Error(`fact ${fact.id} ${POLICY_PASS_REFUSALS.factEmptyPopulation}`);
        }
        run.population = {
          declaredSourcePaths,
          declaredResourcePaths,
          requestedPaths: null,
          effectiveSourcePaths: declaredSourcePaths,
          effectiveResourcePaths: declaredResourcePaths,
        };
        run.files = declaredSourcePaths.map((path) => {
          const sourceFile = sourceFiles.get(path);
          if (sourceFile === undefined) {
            throw new Error(`resolved fact source path has no SourceFile: ${path}`);
          }
          return sourceFile;
        });
        run.effectivePathSet = new Set([...declaredSourcePaths, ...declaredResourcePaths]);
        run.resourceRequests = fact.resources;
        run.status = "success";
        run.error = null;
      });
    } catch (error) {
      markFactIncomplete(run, "population", error, control);
      run.population = EMPTY_POPULATION;
    }
    return run;
  });
}
