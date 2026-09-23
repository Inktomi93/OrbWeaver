// Create + visit dispatch: builds each run's PolicyContext/FactContext, indexes its declared visitors by
// SyntaxKind, and drives the single per-file AST walk (visitFile then the kind-indexed visitors).
import { collectByKinds } from "@orb/tooling/_shared/ts-workspace";
import type { SourceFile, SyntaxKind, TypeChecker } from "ts-morph";
import type { PolicyFactValueRegistry, PolicyToolError } from "../contract/policy-pass.ts";
import { POLICY_PASS_REFUSALS } from "../contract/policy-pass.ts";
import type { ResourceHost } from "../contract/resource-host.ts";
import { makeFactContext, makePolicyContext } from "./policy-pass-context.ts";
import type { FactControl, FactRun, PolicyRun } from "./policy-pass-types.ts";
import { guard, guardFact } from "./policy-pass-types.ts";
import { assertGateFactHooks, assertGatePolicyHooks } from "./policy-validation.ts";

interface CreateRunsInput {
  readonly runs: readonly PolicyRun[];
  readonly paths: ReadonlyMap<object, string>;
  readonly resources: ResourceHost;
  readonly checker: () => TypeChecker;
  readonly errors: PolicyToolError[];
  readonly factValues: PolicyFactValueRegistry;
}

export function createRuns({ runs, paths, resources, checker, errors, factValues }: CreateRunsInput): void {
  for (const run of runs) {
    if (run.owner.status !== "success") {
      continue;
    }
    const runtime = makePolicyContext({
      policy: run.policy,
      paths,
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
      // `execution` is a CLAIM about composition (§12.1): `entire-population` says the verdict cannot compose over
      // a subset. The only hook that runs after the WHOLE walk is `evaluate`, so a policy exposing none reports
      // per node or per file — its verdict composes by construction and the declaration is false (#2111, A21).
      if (run.policy.execution === "entire-population" && hooks.evaluate === undefined) {
        throw new Error(`policy ${run.policy.id} ${POLICY_PASS_REFUSALS.entireWithoutEvaluate}`);
      }
      run.hooks = hooks;
    });
  }
}

interface CreateFactRunsInput {
  readonly runs: readonly FactRun[];
  readonly paths: ReadonlyMap<object, string>;
  readonly resources: ResourceHost;
  readonly checker: () => TypeChecker;
  readonly control: FactControl;
}

export function createFactRuns({ runs, paths, resources, checker, control }: CreateFactRunsInput): void {
  for (const run of runs) {
    if (run.status !== "success") {
      continue;
    }
    const runtime = makeFactContext({
      ownerId: run.fact.id,
      analysis: run.fact.analysis,
      paths,
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

export function walkRuns({ runs, factRuns, sourceFiles, errors, factControl }: WalkRunsInput): void {
  const relevantPaths = new Set([
    ...runs.flatMap((run) => (run.owner.status === "success" ? run.population.effectiveSourcePaths : [])),
    ...factRuns.flatMap((run) => (run.status === "success" ? run.population.effectiveSourcePaths : [])),
  ]);
  for (const [path, sourceFile] of [...sourceFiles]
    .filter(([candidate]) => relevantPaths.has(candidate))
    .toSorted(([left], [right]) => left.localeCompare(right))) {
    const fileRuns = runs.filter((run) => run.owner.status === "success" && run.effectiveSourcePathSet.has(path));
    const fileFactRuns = factRuns.filter((run) => run.status === "success" && run.effectiveSourcePathSet.has(path));
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
