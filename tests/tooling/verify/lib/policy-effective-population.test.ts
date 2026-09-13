// THE SHARED SELECTION CALCULATION (#2309) — the pure truth table, and the two doors agreeing on it.
//
// The defect this file pins was a FALSE CLEAN with a successful owner: a changed-mode request naming only a
// declared RESOURCE scheduled its policy, visited zero source files, and reported clean. Its twin was a TOOL
// ERROR: a request naming only a SOURCE withdrew the resource the same policy declares, so the read that
// obligation 1 of `docs/design/resource-policy-contract.md` requires came back `is undeclared`. Both were
// measured on the two live `baseui-derives-not-respells` siblings; the production control for them lives in
// `tests/tooling/verify/gates/baseui-and-surface-family.repo.int.test.ts` under "§2309".
//
// What a proof row cannot express, and therefore what is here: the calculation is a PROPERTY of the pair of
// doors (`lib/policy-plan.ts` and `lib/policy-pass.ts`), not of any one policy, and its most dangerous failure
// mode — the two doors disagreeing — surfaces as a thrown `applyOwnerPlan` reconciliation rather than as a
// finding.
import type { GatePolicy, PolicyScopeResolution } from "@orb/tooling/verify";
import { defineFact, defineGate, executePolicyPlan, planPolicyCommand } from "@orb/tooling/verify";
import { Project, SyntaxKind } from "ts-morph";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { resolveEffectivePopulation } from "../../../../tooling/src/verify/lib/policy-effective-population.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";
const SOURCE_A = "packages/client/src/a.ts";
const SOURCE_B = "packages/client/src/b.ts";
/** A declared resource identity that is NOT a compiler source candidate — the separation arm's subject. */
const NOTES = "packages/client/src/notes.md";

function selection(overrides: Partial<Parameters<typeof resolveEffectivePopulation>[0]> = {}): ReturnType<typeof resolveEffectivePopulation> {
  return resolveEffectivePopulation({
    execution: "selected-files",
    declaredSourcePaths: [SOURCE_A, SOURCE_B],
    declaredResourcePaths: [NOTES],
    dependencyPaths: [],
    requested: null,
    ...overrides,
  });
}

function requested(...paths: readonly string[]): { identity: readonly string[]; current: ReadonlySet<string> } {
  return { identity: paths, current: new Set(paths) };
}

test("an unnarrowed request is the whole declared population, both axes", () => {
  expect(selection()).toEqual({
    population: {
      declaredSourcePaths: [SOURCE_A, SOURCE_B],
      declaredResourcePaths: [NOTES],
      requestedPaths: null,
      effectiveSourcePaths: [SOURCE_A, SOURCE_B],
      effectiveResourcePaths: [NOTES],
    },
    disposition: "run",
  });
});

test("a SOURCE-only request stays EXACT, and the declared resource data stays whole", () => {
  // The exactness half is the incremental promise: one changed seal is one visited seal. The resource half is
  // the defect's twin — narrowing the input to `[]` is what made `requestStaysDeclared` withdraw the door.
  expect(selection({ requested: requested(SOURCE_A) })).toMatchObject({
    disposition: "run",
    population: { effectiveSourcePaths: [SOURCE_A], effectiveResourcePaths: [NOTES] },
  });
});

test("a changed declared RESOURCE reselects the FULL dependent source population", () => {
  expect(selection({ requested: requested(NOTES) })).toMatchObject({
    disposition: "run",
    population: { effectiveSourcePaths: [SOURCE_A, SOURCE_B], effectiveResourcePaths: [NOTES] },
  });
});

test("a changed DEPENDENCY — a consumed fact's population — reselects the same way a resource does", () => {
  const census = "packages/server/src/census.ts";
  expect(selection({ dependencyPaths: [census], requested: requested(census) })).toMatchObject({
    disposition: "run",
    population: { effectiveSourcePaths: [SOURCE_A, SOURCE_B], effectiveResourcePaths: [NOTES] },
  });
});

test("a request naming nothing this owner declares or depends on is an empty intersection, never a clean run", () => {
  expect(selection({ requested: requested("docs/unrelated.md") })).toMatchObject({
    disposition: "empty-intersection",
    population: { effectiveSourcePaths: [], effectiveResourcePaths: [] },
  });
});

// ── ENTIRE-POPULATION DEFERRAL IS UNCHANGED, AND THE ARM THAT DISCRIMINATES IT ────────────────────────────
//
// Availability and applicability are two questions. `deferred` is still decided on the RAW intersection of the
// owner's own declaration, so completing the resource axis did not make a whole-population policy runnable
// under a partial scope — the arm below is the one that would have gone green if it had.

test("an entire-population owner still defers on a proper subset, and its effective view stays the intersection", () => {
  expect(selection({ execution: "entire-population", requested: requested(SOURCE_A) })).toEqual({
    population: {
      declaredSourcePaths: [SOURCE_A, SOURCE_B],
      declaredResourcePaths: [NOTES],
      requestedPaths: [SOURCE_A],
      effectiveSourcePaths: [SOURCE_A],
      effectiveResourcePaths: [],
    },
    disposition: "deferred",
  });
});

test("an entire-population owner defers when only its RESOURCE was named — completing the input is not covering the population", () => {
  // The arm that prices the alternative design: had a touched resource been allowed to complete the
  // denominator, every `of: "none"` whole-population policy (`biome-grant-liveness` declares `tracked-files`,
  // whose population is the whole corpus) would run on every changed request. It defers.
  expect(selection({ execution: "entire-population", requested: requested(NOTES) })).toMatchObject({
    disposition: "deferred",
    population: { effectiveSourcePaths: [], effectiveResourcePaths: [NOTES] },
  });
});

test("an entire-population owner whose whole declaration is named runs over all of it", () => {
  expect(selection({ execution: "entire-population", requested: requested(SOURCE_A, SOURCE_B, NOTES) })).toMatchObject({
    disposition: "run",
    population: { effectiveSourcePaths: [SOURCE_A, SOURCE_B], effectiveResourcePaths: [NOTES] },
  });
});

test("a DELETED identity selects nothing even though the request still names it", () => {
  // `identity` is what the receipt reports; `current` is what may be selected. Collapsing the two would plan a
  // run over a deleted file and then fail to find its SourceFile one phase later.
  expect(selection({ requested: { identity: [SOURCE_A], current: new Set() } })).toEqual({
    population: {
      declaredSourcePaths: [SOURCE_A, SOURCE_B],
      declaredResourcePaths: [NOTES],
      requestedPaths: [SOURCE_A],
      effectiveSourcePaths: [],
      effectiveResourcePaths: [],
    },
    disposition: "empty-intersection",
  });
});

// ── THE RUNTIME ARMS ──────────────────────────────────────────────────────────────────────────────────────

const OVERLAY: Readonly<Record<string, string>> = {
  "package.json": '{"name":"orb"}',
  [SOURCE_A]: "export const a = 1;\n",
  [SOURCE_B]: "export const b = 2;\n",
  [NOTES]: "fixture\n",
};

function projectOf(): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/${SOURCE_A}`, OVERLAY[SOURCE_A] as string);
  project.createSourceFile(`${ROOT}/${SOURCE_B}`, OVERLAY[SOURCE_B] as string);
  return project;
}

/** A hybrid: a `@client` SOURCE population plus an authored tree that spans the same directory, so one of its
 *  resource identities (`notes.md`) is not a compiler source candidate and the other two are. */
function hybridPolicy(visited: string[]): GatePolicy {
  return defineGate({
    id: "hybrid-selection",
    family: "hybrid-selection",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "resource",
    execution: "selected-files",
    facts: [],
    resources: [{ kind: "authored-tree", id: "client-source" }],
    message: "hybrid-selection message",
    create: (ctx) => ({
      visitFile: (sourceFile) => visited.push(ctx.relativePath(sourceFile)),
      evaluate: () => {
        const tree = ctx.resources.authoredTree("client-source");
        if (tree.status !== "ready") {
          throw new Error(tree.reason);
        }
      },
    }),
    mustFlag: [{ mode: "resource", files: { [SOURCE_A]: "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "resource", files: { [SOURCE_A]: "export const clean = true;\n" }, why: "nearest legal shape" }],
  } as GatePolicy);
}

/** The real selected-files shape: a source population plus a resource DISJOINT from it (the `baseui-read`
 *  siblings' `json:baseui-manifest` is a `tooling/` file, never a `@ui` source). */
function disjointPolicy(visited: string[]): GatePolicy {
  return defineGate({
    id: "disjoint-selection",
    family: "disjoint-selection",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "resource",
    execution: "selected-files",
    facts: [],
    resources: [{ kind: "package-metadata", id: "root" }],
    message: "disjoint-selection message",
    create: (ctx) => ({
      visitFile: (sourceFile) => visited.push(ctx.relativePath(sourceFile)),
      // The availability half: the declared door is READ under a source-only request, which is exactly what
      // the narrowed resource population made impossible.
      evaluate: () => void ctx.resources.packageMetadata("root"),
    }),
    mustFlag: [{ mode: "resource", files: { [SOURCE_A]: "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "resource", files: { [SOURCE_A]: "export const clean = true;\n" }, why: "nearest legal shape" }],
  } as GatePolicy);
}

function dispatch(policies: readonly GatePolicy[], requestedPaths: readonly string[]): PolicyPassResult {
  return runPolicyPass({
    knownPolicies: policies,
    policies,
    root: ROOT,
    project: projectOf(),
    requestedPaths,
    resourceOptions: { overlay: OVERLAY },
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("a resource identity is never a source-visitor input, in either direction of the reselection", () => {
  for (const [label, request] of [
    ["resource-only", [NOTES]],
    ["source-only", [SOURCE_A]],
  ] as const) {
    const visited: string[] = [];
    const result = dispatch([hybridPolicy(visited)], request);
    expect(result.toolErrors, label).toEqual([]);
    expect(result.policies[0]?.owner, label).toEqual({ status: "success", population: "complete" });
    // `notes.md` is declared, acquired and receipted — and never walked. This is the whole separation claim:
    // the resource axis feeds `ctx.resources`, never `run.files`, whichever axis the request named.
    expect(result.policies[0]?.population.effectiveResourcePaths, label).toContain(NOTES);
    expect(visited, label).not.toContain(NOTES);
  }
});

test("THE COUNTEREXAMPLE TO EXACTNESS, taken deliberately: a resource that CONTAINS its own subjects reselects them all", () => {
  // `authored-tree:client-source` spans the same directory the `@client` population judges, so editing `a.ts`
  // changes both a SUBJECT and the DATA every sibling verdict reads. The conservative arm is the sound one —
  // narrowing to `[a.ts]` would render `b.ts`'s stale verdict against a tree that moved — so exactness is
  // promised for a resource DISJOINT from the source population and no further. All three live
  // `selected-files` resource policies are disjoint (`json:baseui-manifest` is not a `@ui` source), which is
  // why the promise holds where it was measured; a future self-overlapping hybrid pays a whole-population
  // walk per changed file and should declare `entire-population` instead.
  const visited: string[] = [];
  expect(dispatch([hybridPolicy(visited)], [SOURCE_A]).toolErrors).toEqual([]);
  expect(visited).toEqual([SOURCE_A, SOURCE_B]);

  // And the disjoint shape, in the same runtime rather than only in the pure table above: the walk is EXACT.
  const seen: string[] = [];
  expect(dispatch([disjointPolicy(seen)], [SOURCE_A]).toolErrors).toEqual([]);
  expect(seen).toEqual([SOURCE_A]);
});

// ── PLANNER AND DISPATCHER AGREE, BY CONSTRUCTION RATHER THAN BY COINCIDENCE ───────────────────────────────

const PROGRAM = {
  id: "packages/client/tsconfig.json",
  config: "packages/client/tsconfig.json",
  files: [SOURCE_A, SOURCE_B],
  references: [],
  configPaths: ["packages/client/tsconfig.json"],
} as const;

function scopeOf(paths: readonly string[]): PolicyScopeResolution {
  const semantic = paths.map((path) => ({ path, status: "modified" as const, previousPath: null }));
  return {
    request: { kind: "file", paths },
    kind: "file",
    label: "file",
    requestedPaths: semantic,
    currentPaths: paths,
    semanticPaths: semantic,
    programs: [PROGRAM],
    requestedProgramIds: [PROGRAM.id],
    ownership: semantic.map((path) => ({ ...path, programIds: [PROGRAM.id], reason: "compiler-membership" as const })),
    workspacePackage: null,
    projectConfig: null,
    inventory: {
      source: "git",
      trackedCommand: ["git", "ls-files", "-z"],
      untrackedCommand: ["git", "ls-files", "--others", "-z"],
      trackedCount: 3,
      untrackedCount: 0,
      authoredCount: 3,
      mergeBase: null,
    },
  };
}

test.each([
  ["a changed resource identity", [NOTES]],
  ["a changed source identity", [SOURCE_A]],
  ["both axes at once", [NOTES, SOURCE_A]],
  ["nothing this owner declares", ["docs/unrelated.md"]],
])("planner and dispatcher select the same population for %s", (_case, paths) => {
  const visited: string[] = [];
  const gate = hybridPolicy(visited);
  const corpus = { gates: [gate], families: [gate.family] };
  const planned = planPolicyCommand({
    request: {
      mode: "run",
      tier: "changed",
      scope: { kind: "file", paths },
      selector: { kind: "all" },
      strictScope: false,
      failOnWarnings: false,
      json: true,
    },
    corpus,
    scope: scopeOf(paths),
    resourceOptions: { root: ROOT, overlay: OVERLAY },
  });
  if (!planned.ok || planned.plan.mode !== "run") {
    throw new Error(`plan did not resolve: ${JSON.stringify(planned)}`);
  }
  // `executePolicyPlan` re-derives the population inside the dispatcher and THROWS on any disagreement with
  // the plan it was handed (`assertExecutedPopulations`, `applyOwnerPlan`), so `ok: true` is the agreement
  // assertion; the equality below states the selected set itself rather than trusting the reconciler.
  const executed = executePolicyPlan({
    root: ROOT,
    project: projectOf(),
    corpus,
    plan: planned.plan,
    reviewedGrants: [],
    resourceOptions: { overlay: OVERLAY },
  });
  expect(executed).toMatchObject({ ok: true });
  if (!executed.ok) {
    throw new Error(executed.message);
  }
  expect(executed.pass.policies[0]?.population).toEqual(planned.plan.policies[0]?.population);
  expect(executed.pass.toolErrors).toEqual([]);
});

// ── A CONSUMED FACT IS AN INPUT, NOT A SUBJECT ────────────────────────────────────────────────────────────

test("a consumed fact is an INPUT: touching only its population keeps the consumer applicable, and the two doors agree on that", () => {
  const census = defineFact({
    id: "selection-census",
    population: { in: ["@server"] },
    analysis: "syntax",
    resources: [],
    create: (ctx) => {
      let members = 0;
      return {
        visitFile: () => {
          members += 1;
        },
        finish: () => {
          ctx.receipt({ kind: "population", source: "selection-census", members });
          return members;
        },
      };
    },
  });
  const visited: string[] = [];
  const consumer = defineGate({
    id: "selection-consumer",
    family: "selection-consumer",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "syntax",
    // `policy-validation.ts:390` refuses `facts` on anything but `entire-population`, so a fact-consuming
    // policy can only ever DEFER or run whole — which is why dependency paths reach the shared calculation's
    // TOUCH set and not its completeness denominator. Counting them in the denominator is what made the
    // planner defer a consumer the dispatcher then resolved `success`, and `applyOwnerPlan` throws on that.
    execution: "entire-population",
    facts: [census],
    resources: [],
    message: "selection-consumer message",
    create: (ctx) => ({
      visitFile: (sourceFile) => visited.push(ctx.relativePath(sourceFile)),
      evaluate: () => {
        void ctx.fact(census);
        ctx.receipt({ kind: "population", source: "selection-consumer", members: visited.length });
      },
    }),
    mustFlag: [{ mode: "source", files: { [SOURCE_A]: "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { [SOURCE_A]: "export const clean = true;\n" }, why: "nearest legal shape" }],
  } as GatePolicy);

  const project = projectOf();
  project.createSourceFile(`${ROOT}/packages/server/src/census.ts`, "export const census = 1;\n");
  const result = runPolicyPass({
    knownPolicies: [consumer],
    policies: [consumer],
    root: ROOT,
    project,
    requestedPaths: ["packages/server/src/census.ts"],
    reviewedGrants: [],
    failOnWarnings: false,
  });

  // The census changed and the consumer's own subjects did not. It is not SKIPPED — the request reached
  // something it reads — and as an entire-population owner under a scope that covers none of its own
  // declaration it DEFERS to the whole run, which is the same verdict the planner reaches.
  expect(result.toolErrors).toEqual([]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "not-applicable", reason: expect.stringMatching(/entire-population/u) });
  expect(visited).toEqual([]);

  // The other side: the same consumer under its OWN population runs, and the fact it reads is resolved over
  // its complete declared population regardless of the narrowing.
  const covering = runPolicyPass({
    knownPolicies: [consumer],
    policies: [consumer],
    root: ROOT,
    project,
    requestedPaths: [SOURCE_A, SOURCE_B],
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(covering.toolErrors).toEqual([]);
  expect(covering.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
  expect(covering.facts[0]?.population.effectiveSourcePaths).toEqual(["packages/server/src/census.ts"]);
});

test("a source population that admits nothing is still refused before any selection question is asked", () => {
  // The calculation is TOTAL and raises nothing; declaration validity stays one layer up, where it was.
  const orphan = defineGate({
    id: "selection-orphan",
    family: "selection-orphan",
    authority: "hard",
    severity: "error",
    population: "@server",
    analysis: "syntax",
    execution: "selected-files",
    facts: [],
    resources: [],
    message: "selection-orphan message",
    create: () => ({ evaluate: () => undefined }),
    mustFlag: [{ mode: "source", files: { "packages/server/src/x.ts": "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "source", files: { "packages/server/src/x.ts": "export const clean = true;\n" }, why: "nearest legal shape" }],
  } as GatePolicy);
  const result = dispatch([orphan], [SOURCE_A]);
  expect(result.toolErrors).toMatchObject([{ policyId: "selection-orphan", phase: "population" }]);
  expect(result.authority.withheldPolicyIds).toEqual(["selection-orphan"]);
});

test("a visitor is indexed for every reselected file — the dispatcher's own SyntaxKind walk, not just its receipt", () => {
  const seen: string[] = [];
  const gate = defineGate({
    id: "selection-walk",
    family: "selection-walk",
    authority: "hard",
    severity: "error",
    population: "@client",
    analysis: "resource",
    execution: "selected-files",
    facts: [],
    resources: [{ kind: "authored-tree", id: "client-source" }],
    message: "selection-walk message",
    create: (ctx) => ({
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node) => seen.push(node.getSourceFile().getBaseName()),
        },
      ],
      evaluate: () => void ctx.resources.authoredTree("client-source"),
    }),
    mustFlag: [{ mode: "resource", files: { [SOURCE_A]: "export const planted = true;\n" }, why: "founding defect" }],
    mustPass: [{ mode: "resource", files: { [SOURCE_A]: "export const clean = true;\n" }, why: "nearest legal shape" }],
  } as GatePolicy);
  expect(dispatch([gate], [NOTES]).toolErrors).toEqual([]);
  expect(seen).toEqual(["a.ts", "b.ts"]);
});
