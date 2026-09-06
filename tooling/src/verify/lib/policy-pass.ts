// Final policy dispatcher: resolve once, create once, walk once, then centrally reconcile authority.
import { isAbsolute, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { collectByKinds } from "@orb/tooling/_shared/ts-workspace";
import type { SourceFile, SyntaxKind, TypeChecker } from "ts-morph";
import type { GateFact, GateFactHooks } from "../contract/fact.ts";
import type { GateOwnerCompletion, RawGateFinding } from "../contract/gate-authority.ts";
import type { OrdinaryWaiverSource } from "../contract/ordinary-waiver-source.ts";
import type { GatePolicy, GatePolicyHooks } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type {
  GateFactOwnerResult,
  GateFactPhase,
  GateFactToolError,
  PolicyOwnerPlan,
  PolicyOwnerResult,
  PolicyPassInput,
  PolicyPassResult,
  PolicyPhase,
  PolicyPopulationReceipt,
  PolicySemanticReceipt,
  PolicyTiming,
  PolicyToolError,
} from "../contract/policy-pass.ts";
import { GATE_FACT_PHASES, POLICY_OWNER_PLAN_MODES, POLICY_PHASES } from "../contract/policy-pass.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import { createResourceHost } from "../ops/resource-host.ts";
import { coordinateGateAuthority } from "./gate-authority.ts";
import { ordinaryWaiverResourceFormat } from "./ordinary-waiver-source.ts";
import type { PolicyFactValueRegistry } from "./policy-pass-context.ts";
import { makeFactContext, makePolicyContext } from "./policy-pass-context.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";
import {
  assertGateFactDescriptor,
  assertGateFactHooks,
  assertGatePolicyDescriptor,
  assertGatePolicyHooks,
  assertRepoPathIdentity,
  normalizePathSet,
} from "./policy-validation.ts";
import { resolvePopulation } from "./population-resolver.ts";
import { beginReferencePass, endReferencePass } from "./reference-fact.ts";
import { resolveResourceDeclarations } from "./resource-declaration.ts";

interface MutableTiming {
  readonly phaseMs: Record<PolicyPhase, number>;
}

interface MutableFactTiming {
  readonly phaseMs: Record<GateFactPhase, number>;
}

interface PolicyRun {
  readonly policy: GatePolicy;
  readonly timing: MutableTiming;
  readonly findings: RawGateFinding[];
  population: PolicyPopulationReceipt;
  owner: GateOwnerCompletion;
  files: readonly SourceFile[];
  effectivePathSet: ReadonlySet<string>;
  hooks: GatePolicyHooks | undefined;
  receipts: readonly PolicySemanticReceipt[];
  finishReceipts: (() => readonly PolicySemanticReceipt[]) | undefined;
  unconsumedFacts: (() => readonly string[]) | undefined;
  unconsumedResources: (() => readonly string[]) | undefined;
  unconsumedResourceRequests: (() => readonly string[]) | undefined;
  resourceRequests: readonly GateResourceRequest[];
}

interface FactRun {
  readonly fact: GateFact;
  readonly timing: MutableFactTiming;
  population: PolicyPopulationReceipt;
  status: "success" | "incomplete";
  error: string | null;
  files: readonly SourceFile[];
  effectivePathSet: ReadonlySet<string>;
  hooks: GateFactHooks<unknown> | undefined;
  receipts: readonly PolicySemanticReceipt[];
  finishReceipts: (() => readonly PolicySemanticReceipt[]) | undefined;
  unconsumedResources: (() => readonly string[]) | undefined;
  unconsumedResourceRequests: (() => readonly string[]) | undefined;
  resourceRequests: readonly GateResourceRequest[];
}

interface FactControl {
  readonly errors: GateFactToolError[];
  readonly values: PolicyFactValueRegistry;
}

const EMPTY_POPULATION: PolicyPopulationReceipt = {
  declaredSourcePaths: [],
  declaredResourcePaths: [],
  requestedPaths: null,
  effectiveSourcePaths: [],
  effectiveResourcePaths: [],
};

function phaseRecord(): Record<PolicyPhase, number> {
  return { population: 0, create: 0, visitFile: 0, visit: 0, evaluate: 0, receipt: 0 };
}

function factPhaseRecord(): Record<GateFactPhase, number> {
  return { population: 0, create: 0, visitFile: 0, visit: 0, finish: 0, receipt: 0 };
}

function floorMs(value: number): number {
  const precision = 1000;
  return Math.floor(value * precision) / precision;
}

function ceilMs(value: number): number {
  const precision = 1000;
  return Math.ceil(value * precision) / precision;
}

function charge<T>(timing: MutableTiming, phase: PolicyPhase, operation: () => T): T {
  const started = performance.now();
  try {
    return operation();
  } finally {
    timing.phaseMs[phase] += performance.now() - started;
  }
}

function finishTiming(timing: MutableTiming): PolicyTiming {
  const phaseMs = Object.fromEntries(POLICY_PHASES.map((phase) => [phase, floorMs(timing.phaseMs[phase])])) as Record<PolicyPhase, number>;
  return { phaseMs, totalMs: POLICY_PHASES.reduce((sum, phase) => sum + phaseMs[phase], 0) };
}

function finishFactTiming(timing: MutableFactTiming): GateFactOwnerResult["timing"] {
  const phaseMs = Object.fromEntries(GATE_FACT_PHASES.map((phase) => [phase, floorMs(timing.phaseMs[phase])])) as Record<GateFactPhase, number>;
  return { phaseMs, totalMs: GATE_FACT_PHASES.reduce((sum, phase) => sum + phaseMs[phase], 0) };
}

function chargeFact<T>(timing: MutableFactTiming, phase: GateFactPhase, operation: () => T): T {
  const started = performance.now();
  try {
    return operation();
  } finally {
    timing.phaseMs[phase] += performance.now() - started;
  }
}

function sourcePath(root: string, sourceFile: SourceFile): string {
  const rel = relative(resolve(root), resolve(sourceFile.getFilePath()));
  const normalized = sep === "/" ? rel : rel.split(sep).join("/");
  if (normalized.length === 0 || isAbsolute(rel) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`source file is outside the policy root: ${sourceFile.getFilePath()}`);
  }
  assertRepoPathIdentity(normalized, "source file path");
  return normalized;
}

function isExplicitNone(owner: Pick<GatePolicy, "population"> | Pick<GateFact, "population">): boolean {
  const population = owner.population;
  return typeof population === "object" && !Array.isArray(population) && "of" in population && population.of === "none";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function markIncomplete(run: PolicyRun, phase: PolicyPhase, error: unknown, errors: PolicyToolError[]): void {
  const message = messageOf(error);
  run.owner = { status: "incomplete", population: "incomplete", reason: `${phase}: ${message}` };
  errors.push({ policyId: run.policy.id, phase, message });
}

function guard(run: PolicyRun, phase: Exclude<PolicyPhase, "population">, errors: PolicyToolError[], operation: () => void): void {
  if (run.owner.status !== "success") {
    return;
  }
  try {
    charge(run.timing, phase, operation);
  } catch (error) {
    markIncomplete(run, phase, error, errors);
  }
}

function markFactIncomplete(run: FactRun, phase: GateFactPhase, error: unknown, control: FactControl): void {
  const message = messageOf(error);
  run.status = "incomplete";
  run.error = `${phase}: ${message}`;
  control.errors.push({ factId: run.fact.id, phase, message });
  control.values.set(run.fact, { status: "failed", message: run.error });
}

function guardFact(run: FactRun, phase: Exclude<GateFactPhase, "population">, control: FactControl, operation: () => void): void {
  if (run.status !== "success") {
    return;
  }
  try {
    chargeFact(run.timing, phase, operation);
  } catch (error) {
    markFactIncomplete(run, phase, error, control);
  }
}

function canonicalFindings(findings: readonly RawGateFinding[]): readonly RawGateFinding[] {
  return [...findings].toSorted(
    (left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      (left.token ?? "").localeCompare(right.token ?? "") ||
      (left.message ?? "").localeCompare(right.message ?? ""),
  );
}

function assertInvocationPolicies(policies: readonly GatePolicy[]): void {
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

function assertSelectedPoliciesAreLoaded(knownPolicies: readonly GatePolicy[], selectedPolicies: readonly GatePolicy[]): void {
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

function newRun(policy: GatePolicy): PolicyRun {
  return {
    policy,
    timing: { phaseMs: phaseRecord() },
    findings: [],
    population: EMPTY_POPULATION,
    owner: { status: "incomplete", population: "incomplete", reason: "population has not resolved" },
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
  readonly requestedPaths: readonly string[] | null;
  readonly resources: readonly string[];
}

function resolveRun({ run, candidates, sourceFiles, requestedPaths, resources }: ResolutionInput): void {
  const declared = resolvePopulation(run.policy.population, candidates).paths;
  if (run.policy.analysis !== "resource" && resources.length > 0) {
    throw new Error(`non-resource policy ${run.policy.id} received resource paths`);
  }
  if (isExplicitNone(run.policy) && resources.length === 0) {
    throw new Error(`resource-only policy ${run.policy.id} resolved no resource paths`);
  }
  const requestedSet = requestedPaths === null ? null : new Set(requestedPaths);
  const effectiveSourcePaths = requestedSet === null ? declared : declared.filter((path) => requestedSet.has(path));
  const effectiveResourcePaths = requestedSet === null ? resources : resources.filter((path) => requestedSet.has(path));
  run.population = {
    declaredSourcePaths: declared,
    declaredResourcePaths: resources,
    requestedPaths,
    effectiveSourcePaths,
    effectiveResourcePaths,
  };
  const effectiveTotal = effectiveSourcePaths.length + effectiveResourcePaths.length;
  const declaredTotal = declared.length + resources.length;
  run.files = effectiveSourcePaths.map((path) => {
    const sourceFile = sourceFiles.get(path);
    if (sourceFile === undefined) {
      throw new Error(`resolved source population path has no SourceFile: ${path}`);
    }
    return sourceFile;
  });
  run.effectivePathSet = new Set([...effectiveSourcePaths, ...effectiveResourcePaths]);
  if (requestedSet !== null && effectiveTotal === 0) {
    run.owner = { status: "not-applicable", population: "complete", reason: "requested selection has an empty policy intersection" };
  } else if (run.policy.execution === "entire-population" && effectiveTotal < declaredTotal) {
    run.owner = { status: "not-applicable", population: "complete", reason: "entire-population policy deferred for a proper subset selection" };
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

function assertOwnerPlans(input: PolicyPassInput): void {
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

function resolveRuns(
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
  const runs = input.policies.map(newRun);
  for (const run of runs) {
    try {
      charge(run.timing, "population", () => {
        const declaredResources = resolveResourceDeclarations(resources, run.policy.resources);
        resolveRun({ run, candidates, sourceFiles, requestedPaths, resources: declaredResources });
        const effectiveResources = new Set(run.population.effectiveResourcePaths);
        run.resourceRequests = run.policy.resources.filter((request) =>
          resolveResourceDeclarations(resources, [request]).some((path) => effectiveResources.has(path)),
        );
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

function selectedFacts(runs: readonly PolicyRun[]): readonly GateFact[] {
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

function resolveFactRuns({ facts, sourceFiles, resources, control }: ResolveFactRunsInput): FactRun[] {
  const candidates = [...sourceFiles.keys()].toSorted();
  return facts.map((fact) => {
    const run = newFactRun(fact);
    control.values.set(fact, { status: "pending" });
    try {
      chargeFact(run.timing, "population", () => {
        const declaredSourcePaths = resolvePopulation(fact.population, candidates).paths;
        const declaredResourcePaths = resolveResourceDeclarations(resources, fact.resources);
        if (isExplicitNone(fact) && declaredResourcePaths.length === 0) {
          throw new Error(`resource-only fact ${fact.id} resolved no resource paths`);
        }
        if (declaredSourcePaths.length + declaredResourcePaths.length === 0) {
          throw new Error(`fact ${fact.id} resolved an empty declared population`);
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
        const effectiveResources = new Set(declaredResourcePaths);
        run.resourceRequests = fact.resources.filter((request) =>
          resolveResourceDeclarations(resources, [request]).some((path) => effectiveResources.has(path)),
        );
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

interface CreateRunsInput {
  readonly runs: readonly PolicyRun[];
  readonly input: PolicyPassInput;
  readonly resources: ResourceHost;
  readonly checker: () => TypeChecker;
  readonly errors: PolicyToolError[];
  readonly factValues: PolicyFactValueRegistry;
}

function createRuns({ runs, input, resources, checker, errors, factValues }: CreateRunsInput): void {
  for (const run of runs) {
    if (run.owner.status !== "success") {
      continue;
    }
    const runtime = makePolicyContext({
      policy: run.policy,
      root: input.root,
      files: run.files,
      resourcePaths: run.population.effectiveResourcePaths,
      resources,
      resourceRequests: run.resourceRequests,
      checker,
      findings: run.findings,
      factValues,
    });
    run.finishReceipts = runtime.finishReceipts;
    run.unconsumedFacts = runtime.unconsumedFacts;
    run.unconsumedResources = runtime.unconsumedResources;
    run.unconsumedResourceRequests = runtime.unconsumedResourceRequests;
    guard(run, "create", errors, () => {
      const hooks = run.policy.create(runtime.context);
      assertGatePolicyHooks(hooks);
      run.hooks = hooks;
    });
  }
}

interface CreateFactRunsInput {
  readonly runs: readonly FactRun[];
  readonly input: PolicyPassInput;
  readonly resources: ResourceHost;
  readonly checker: () => TypeChecker;
  readonly control: FactControl;
}

function createFactRuns({ runs, input, resources, checker, control }: CreateFactRunsInput): void {
  for (const run of runs) {
    if (run.status !== "success") {
      continue;
    }
    const runtime = makeFactContext({
      ownerId: run.fact.id,
      analysis: run.fact.analysis,
      root: input.root,
      files: run.files,
      resourcePaths: run.population.effectiveResourcePaths,
      resources,
      resourceRequests: run.resourceRequests,
      checker,
    });
    run.finishReceipts = runtime.finishReceipts;
    run.unconsumedResources = runtime.unconsumedResources;
    run.unconsumedResourceRequests = runtime.unconsumedResourceRequests;
    guardFact(run, "create", control, () => {
      const hooks = run.fact.create(runtime.context);
      assertGateFactHooks(hooks);
      run.hooks = hooks;
    });
  }
}

type VisitorIndex = Map<SyntaxKind, ((node: import("ts-morph").Node, sf: SourceFile) => void)[]>;

function addVisitor(index: VisitorIndex, kind: SyntaxKind, visit: (node: import("ts-morph").Node, sf: SourceFile) => void): void {
  const existing = index.get(kind);
  if (existing === undefined) {
    index.set(kind, [visit]);
  } else {
    existing.push(visit);
  }
}

function indexPolicyVisitors(runs: readonly PolicyRun[], errors: PolicyToolError[], index: VisitorIndex): void {
  for (const run of runs) {
    if (run.owner.status !== "success") {
      continue;
    }
    for (const visitor of run.hooks?.visitors ?? []) {
      for (const kind of visitor.kinds) {
        const dispatch = (node: import("ts-morph").Node, sourceFile: SourceFile): void => {
          guard(run, "visit", errors, () => visitor.visit(node, sourceFile));
        };
        addVisitor(index, kind, dispatch);
      }
    }
  }
}

function indexFactVisitors(runs: readonly FactRun[], control: FactControl, index: VisitorIndex): void {
  for (const run of runs) {
    if (run.status !== "success") {
      continue;
    }
    for (const visitor of run.hooks?.visitors ?? []) {
      for (const kind of visitor.kinds) {
        addVisitor(index, kind, (node, sourceFile) => guardFact(run, "visit", control, () => visitor.visit(node, sourceFile)));
      }
    }
  }
}

interface WalkRunsInput {
  readonly runs: readonly PolicyRun[];
  readonly factRuns: readonly FactRun[];
  readonly sourceFiles: ReadonlyMap<string, SourceFile>;
  readonly errors: PolicyToolError[];
  readonly factControl: FactControl;
}

function walkRuns({ runs, factRuns, sourceFiles, errors, factControl }: WalkRunsInput): void {
  const relevantPaths = new Set([
    ...runs.flatMap((run) => (run.owner.status === "success" ? run.population.effectiveSourcePaths : [])),
    ...factRuns.flatMap((run) => (run.status === "success" ? run.population.effectiveSourcePaths : [])),
  ]);
  for (const [path, sourceFile] of [...sourceFiles]
    .filter(([candidate]) => relevantPaths.has(candidate))
    .toSorted(([left], [right]) => left.localeCompare(right))) {
    const fileRuns = runs.filter((run) => run.owner.status === "success" && run.effectivePathSet.has(path));
    const fileFactRuns = factRuns.filter((run) => run.status === "success" && run.effectivePathSet.has(path));
    for (const run of fileRuns) {
      if (run.hooks?.visitFile !== undefined) {
        guard(run, "visitFile", errors, () => run.hooks?.visitFile?.(sourceFile));
      }
    }
    for (const run of fileFactRuns) {
      if (run.hooks?.visitFile !== undefined) {
        guardFact(run, "visitFile", factControl, () => run.hooks?.visitFile?.(sourceFile));
      }
    }
    const visitors: VisitorIndex = new Map();
    indexPolicyVisitors(fileRuns, errors, visitors);
    indexFactVisitors(fileFactRuns, factControl, visitors);
    collectByKinds([sourceFile], visitors);
  }
}

function receiptFailures(receipt: PolicySemanticReceipt): readonly string[] {
  const count = receipt.kind === "population" ? receipt.members : receipt.resources;
  const label = receipt.kind === "population" ? "members" : "resources";
  const failures: string[] = [];
  if (count === 0) {
    failures.push(`${receipt.kind} ${JSON.stringify(receipt.source)} resolved zero ${label}`);
  }
  if (receipt.unresolved > 0) {
    failures.push(`${receipt.kind} ${JSON.stringify(receipt.source)} left ${receipt.unresolved} unresolved`);
  }
  return failures;
}

function factReceiptFailures(run: FactRun): string[] {
  const failures: string[] = [];
  if (!run.receipts.some((receipt) => receipt.kind === "population" || receipt.kind === "resource")) {
    failures.push("fact produced no semantic receipt");
  }
  if (run.population.effectiveResourcePaths.length > 0 && !run.receipts.some((receipt) => receipt.kind === "resource")) {
    failures.push("declared fact resource population produced no resource receipt");
  }
  const unconsumed = run.unconsumedResources?.() ?? [];
  if (unconsumed.length > 0) {
    failures.push(`declared fact resource population has unconsumed paths: ${unconsumed.join(", ")}`);
  }
  const unconsumedRequests = run.unconsumedResourceRequests?.() ?? [];
  if (unconsumedRequests.length > 0) {
    failures.push(`declared fact resource population has unconsumed requests: ${unconsumedRequests.join(", ")}`);
  }
  return failures;
}

function finishFactRuns(runs: readonly FactRun[], control: FactControl): void {
  for (const run of runs) {
    guardFact(run, "finish", control, () => {
      const finish = run.hooks?.finish;
      if (finish === undefined) {
        throw new Error("fact collector has no finish hook");
      }
      control.values.set(run.fact, { status: "ready", value: finish() });
    });
    run.receipts = run.finishReceipts?.() ?? [];
    guardFact(run, "receipt", control, () => {
      const failures = factReceiptFailures(run);
      if (failures.length > 0) {
        throw new Error(`fact receipt refused: ${failures.join("; ")}`);
      }
    });
  }
}

function withholdFactDependents(runs: readonly PolicyRun[], errors: PolicyToolError[], values: PolicyFactValueRegistry): void {
  for (const run of runs) {
    if (run.owner.status !== "success") {
      continue;
    }
    const failed = run.policy.facts.find((fact) => values.get(fact)?.status === "failed");
    if (failed !== undefined) {
      const value = values.get(failed);
      const message = value?.status === "failed" ? value.message : "unknown fact failure";
      markIncomplete(run, "evaluate", new Error(`declared fact failed: ${failed.id}: ${message}`), errors);
    }
  }
}

function policyReceiptFailures(run: PolicyRun): string[] {
  const failures = run.receipts.flatMap(receiptFailures);
  const unconsumedFacts = run.unconsumedFacts?.() ?? [];
  if (unconsumedFacts.length > 0) {
    failures.push(`declared facts were not consumed: ${unconsumedFacts.join(", ")}`);
  }
  if (run.population.effectiveResourcePaths.length > 0 && !run.receipts.some((receipt) => receipt.kind === "resource")) {
    failures.push("declared resource population produced no resource receipt");
  }
  const unconsumed = run.unconsumedResources?.() ?? [];
  if (unconsumed.length > 0) {
    failures.push(`declared resource population has unconsumed paths: ${unconsumed.join(", ")}`);
  }
  const unconsumedRequests = run.unconsumedResourceRequests?.() ?? [];
  if (unconsumedRequests.length > 0) {
    failures.push(`declared resource population has unconsumed requests: ${unconsumedRequests.join(", ")}`);
  }
  return failures;
}

function evaluateRuns(runs: readonly PolicyRun[], errors: PolicyToolError[]): void {
  for (const run of runs) {
    if (run.hooks?.evaluate !== undefined) {
      guard(run, "evaluate", errors, () => run.hooks?.evaluate?.());
    }
    run.receipts = run.finishReceipts?.() ?? [];
    guard(run, "receipt", errors, () => {
      const failures = policyReceiptFailures(run);
      if (failures.length > 0) {
        throw new Error(`policy receipt refused: ${failures.join("; ")}`);
      }
    });
  }
}

function ownerResult(run: PolicyRun): PolicyOwnerResult {
  return {
    id: run.policy.id,
    owner: run.owner,
    population: run.population,
    findings: canonicalFindings(run.findings),
    receipts: run.receipts,
    timing: finishTiming(run.timing),
  };
}

function factResult(run: FactRun): GateFactOwnerResult {
  return {
    id: run.fact.id,
    status: run.status,
    population: run.population,
    receipts: run.receipts,
    timing: finishFactTiming(run.timing),
    error: run.error,
  };
}

function ordinaryWaiverSources(
  policies: readonly PolicyOwnerResult[],
  sourceFiles: ReadonlyMap<string, SourceFile>,
  resourceSources: readonly OrdinaryWaiverSource[],
): readonly OrdinaryWaiverSource[] {
  const sourcePaths = new Set(policies.flatMap(({ population }) => population.effectiveSourcePaths));
  const resourcePaths = new Set(policies.flatMap(({ population }) => population.effectiveResourcePaths));
  const resourcesByPath = new Map(resourceSources.map((source) => [source.path, source]));
  const sources: OrdinaryWaiverSource[] = [...sourcePaths].toSorted().map((path) => {
    const sourceFile = sourceFiles.get(path);
    if (sourceFile === undefined) {
      throw new Error(`ordinary waiver source population has no SourceFile: ${path}`);
    }
    return { kind: "typescript", path, sourceFile };
  });
  for (const path of [...resourcePaths].toSorted()) {
    if (ordinaryWaiverResourceFormat(path) === undefined) {
      continue;
    }
    const source = resourcesByPath.get(path);
    if (source === undefined || source.kind !== "resource") {
      const completedOwnerRequiresCarrier = policies.some(
        ({ owner, population }) => owner.status === "success" && population.effectiveResourcePaths.includes(path),
      );
      if (completedOwnerRequiresCarrier) {
        throw new Error(`ordinary waiver resource population has no exact text carrier: ${path}`);
      }
      continue;
    }
    if (sourcePaths.has(path)) {
      throw new Error(`ordinary waiver population has ambiguous syntax and resource carriers: ${path}`);
    }
    sources.push(source);
  }
  return Object.freeze(sources);
}

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
  createFactRuns({ runs: factRuns, input, resources, checker: sharedChecker, control: factControl });
  createRuns({ runs, input, resources, checker: sharedChecker, errors: toolErrors, factValues });
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
  const authority = coordinateGateAuthority({
    knownPolicies: input.knownPolicies.map(({ id, authority: policyAuthority, severity }) => ({ id, authority: policyAuthority, severity })),
    selectedPolicies: input.policies.map(({ id, authority: policyAuthority, severity }) => ({ id, authority: policyAuthority, severity })),
    ordinaryWaiverSources: ordinaryWaiverSources(policies, sourceFiles, resourceInvocation.ordinaryWaiverSources()),
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
    authority,
    timing: { totalMs: Math.max(ceilMs(performance.now() - started), policyMs + factMs), policyMs, factMs },
  };
}
