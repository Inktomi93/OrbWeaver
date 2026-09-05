// Final policy dispatcher: resolve once, create once, walk once, then centrally reconcile authority.
import { isAbsolute, relative, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { collectByKinds } from "@orb/tooling/_shared/ts-workspace";
import type { SourceFile, SyntaxKind, TypeChecker } from "ts-morph";
import type { GateOwnerCompletion, RawGateFinding } from "../contract/gate-authority.ts";
import type { GatePolicy, GatePolicyHooks } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import type {
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
import { POLICY_OWNER_PLAN_MODES, POLICY_PHASES } from "../contract/policy-pass.ts";
import type { GateResourceRequest } from "../contract/resource-declaration.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import { createResourceHost } from "../ops/resource-host.ts";
import { coordinateGateAuthority } from "./gate-authority.ts";
import { makePolicyContext } from "./policy-pass-context.ts";
import { isPolicySourceCandidate } from "./policy-source-candidate.ts";
import { assertGatePolicyDescriptor, assertGatePolicyHooks, assertRepoPathIdentity, normalizePathSet } from "./policy-validation.ts";
import { resolvePopulation } from "./population-resolver.ts";
import { resolveResourceDeclarations } from "./resource-declaration.ts";

interface MutableTiming {
  readonly phaseMs: Record<PolicyPhase, number>;
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
  unconsumedResources: (() => readonly string[]) | undefined;
  unconsumedResourceRequests: (() => readonly string[]) | undefined;
  resourceRequests: readonly GateResourceRequest[];
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

function sourcePath(root: string, sourceFile: SourceFile): string {
  const rel = relative(resolve(root), resolve(sourceFile.getFilePath()));
  const normalized = sep === "/" ? rel : rel.split(sep).join("/");
  if (normalized.length === 0 || isAbsolute(rel) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`source file is outside the policy root: ${sourceFile.getFilePath()}`);
  }
  assertRepoPathIdentity(normalized, "source file path");
  return normalized;
}

function isExplicitNone(policy: GatePolicy): boolean {
  const population = policy.population;
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
  for (const candidate of value) {
    if (!isDefinedGatePolicy(candidate)) {
      throw new Error("runPolicyPass accepts only policies branded by defineGate");
    }
    assertGatePolicyDescriptor(candidate);
    if (ids.has(candidate.id)) {
      throw new Error(`runPolicyPass received duplicate policy id ${candidate.id}`);
    }
    ids.add(candidate.id);
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

interface CreateRunsInput {
  readonly runs: readonly PolicyRun[];
  readonly input: PolicyPassInput;
  readonly resources: ResourceHost;
  readonly checker: () => TypeChecker;
  readonly errors: PolicyToolError[];
}

function createRuns({ runs, input, resources, checker, errors }: CreateRunsInput): void {
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
    });
    run.finishReceipts = runtime.finishReceipts;
    run.unconsumedResources = runtime.unconsumedResources;
    run.unconsumedResourceRequests = runtime.unconsumedResourceRequests;
    guard(run, "create", errors, () => {
      const hooks = run.policy.create(runtime.context);
      assertGatePolicyHooks(hooks);
      run.hooks = hooks;
    });
  }
}

function indexVisitors(
  runs: readonly PolicyRun[],
  errors: PolicyToolError[],
): ReadonlyMap<SyntaxKind, readonly ((node: import("ts-morph").Node, sf: SourceFile) => void)[]> {
  const index = new Map<SyntaxKind, ((node: import("ts-morph").Node, sf: SourceFile) => void)[]>();
  for (const run of runs) {
    if (run.owner.status !== "success") {
      continue;
    }
    for (const visitor of run.hooks?.visitors ?? []) {
      for (const kind of visitor.kinds) {
        const dispatch = (node: import("ts-morph").Node, sourceFile: SourceFile): void => {
          guard(run, "visit", errors, () => visitor.visit(node, sourceFile));
        };
        const existing = index.get(kind);
        if (existing === undefined) {
          index.set(kind, [dispatch]);
        } else {
          existing.push(dispatch);
        }
      }
    }
  }
  return index;
}

function walkRuns(runs: readonly PolicyRun[], sourceFiles: ReadonlyMap<string, SourceFile>, errors: PolicyToolError[]): void {
  const relevantPaths = new Set(runs.flatMap((run) => (run.owner.status === "success" ? run.population.effectiveSourcePaths : [])));
  for (const [path, sourceFile] of [...sourceFiles]
    .filter(([candidate]) => relevantPaths.has(candidate))
    .toSorted(([left], [right]) => left.localeCompare(right))) {
    const fileRuns = runs.filter((run) => run.owner.status === "success" && run.effectivePathSet.has(path));
    for (const run of fileRuns) {
      if (run.hooks?.visitFile !== undefined) {
        guard(run, "visitFile", errors, () => run.hooks?.visitFile?.(sourceFile));
      }
    }
    const visitors = indexVisitors(fileRuns, errors);
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

function evaluateRuns(runs: readonly PolicyRun[], errors: PolicyToolError[]): void {
  for (const run of runs) {
    if (run.hooks?.evaluate !== undefined) {
      guard(run, "evaluate", errors, () => run.hooks?.evaluate?.());
    }
    run.receipts = run.finishReceipts?.() ?? [];
    guard(run, "receipt", errors, () => {
      const failures = run.receipts.flatMap(receiptFailures);
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

/** Run every selected policy with invocation-local state, then coordinate all authority centrally. */
export function runPolicyPass(input: PolicyPassInput): PolicyPassResult {
  assertInvocationPolicies(input.policies);
  assertOwnerPlans(input);
  const started = performance.now();
  const toolErrors: PolicyToolError[] = [];
  const resources = createResourceHost({ ...input.resourceOptions, root: input.root }).host;
  const { runs, sourceFiles } = resolveRuns(input, resources, toolErrors);
  let checker: TypeChecker | undefined;
  const sharedChecker = (): TypeChecker => {
    checker ??= input.project.getTypeChecker();
    return checker;
  };
  createRuns({ runs, input, resources, checker: sharedChecker, errors: toolErrors });
  walkRuns(runs, sourceFiles, toolErrors);
  evaluateRuns(runs, toolErrors);
  const policies = runs.map(ownerResult).toSorted((left, right) => left.id.localeCompare(right.id));
  const authority = coordinateGateAuthority({
    selectedPolicies: input.policies.map(({ id, authority: policyAuthority, severity }) => ({ id, authority: policyAuthority, severity })),
    ownerResults: policies.map(({ id, population, owner, findings }) => ({
      policyId: id,
      populationFiles: [...new Set([...population.effectiveSourcePaths, ...population.effectiveResourcePaths])].toSorted(),
      owner,
      findings,
    })),
    reviewedGrants: input.reviewedGrants,
    failOnWarnings: input.failOnWarnings,
    ...(input.waiverFor === undefined ? {} : { waiverFor: input.waiverFor }),
    ...(input.reconcileOrdinary === undefined ? {} : { reconcileOrdinary: input.reconcileOrdinary }),
  });
  const sortedErrors = toolErrors.toSorted(
    (left, right) =>
      left.policyId.localeCompare(right.policyId) ||
      POLICY_PHASES.indexOf(left.phase) - POLICY_PHASES.indexOf(right.phase) ||
      left.message.localeCompare(right.message),
  );
  const policyMs = policies.reduce((sum, policyResult) => sum + policyResult.timing.totalMs, 0);
  return { policies, toolErrors: sortedErrors, authority, timing: { totalMs: Math.max(ceilMs(performance.now() - started), policyMs), policyMs } };
}
