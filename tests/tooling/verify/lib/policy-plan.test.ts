import { execFileSync } from "node:child_process";
import type { GatePolicy, PolicyCommandRequest, PolicyPassResult, PolicyScopeResolution } from "@orb/tooling/verify";
import { defineFact, defineGate, executePolicyPlan, planPolicyArgv, planPolicyCommand, policyPassExitCode, policySourceCandidates } from "@orb/tooling/verify";
import { Project, SyntaxKind } from "ts-morph";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

function policy(
  id: string,
  options: Partial<Pick<GatePolicy, "family" | "execution" | "analysis" | "population" | "facts" | "resources" | "severity" | "create">> = {},
): GatePolicy {
  const analysis = options.analysis ?? "syntax";
  const proofMode = analysis === "syntax" ? "source" : analysis;
  const files = analysis === "resource" ? { "tooling/package.json": "{}\n" } : { "tooling/src/a.ts": "export const a = 1;\n" };
  const resources: GatePolicy["resources"] = options.resources ?? (analysis === "resource" ? [{ kind: "package-metadata", id: "tooling" }] : []);
  const base = {
    id,
    family: options.family ?? id,
    authority: "hard",
    population: options.population ?? "@tooling",
    analysis,
    execution: options.execution ?? "selected-files",
    facts: options.facts ?? [],
    resources,
    message: `${id} message`,
    create:
      options.create ?? ((): ReturnType<GatePolicy["create"]> => ({ visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: (): void => undefined }] })),
    mustFlag: [{ mode: proofMode, files, why: "founding defect" }],
    mustPass: [{ mode: proofMode, files, why: "nearest legal shape" }],
  } as const;
  return options.severity === "warning" ? defineGate({ ...base, severity: "warning", workItem: 1584 }) : defineGate({ ...base, severity: "error" });
}

const PROGRAM = {
  id: "tooling/tsconfig.json",
  config: "tooling/tsconfig.json",
  files: ["tooling/src/a.ts", "tooling/src/b.ts"],
  references: [],
  configPaths: ["tooling/tsconfig.json"],
} as const;

function scope(currentPaths: readonly string[], kind: PolicyScopeResolution["kind"] = "whole"): PolicyScopeResolution {
  const semanticPaths = currentPaths.map((path) => ({ path, status: "present" as const, previousPath: null }));
  return {
    request: kind === "whole" ? { kind: "whole" } : { kind: "file", paths: currentPaths },
    kind,
    label: kind,
    requestedPaths: kind === "whole" ? null : semanticPaths,
    currentPaths,
    semanticPaths: kind === "whole" ? [] : semanticPaths,
    programs: [PROGRAM],
    requestedProgramIds: kind === "whole" ? [PROGRAM.id] : [PROGRAM.id],
    ownership: semanticPaths.map((path) => ({ ...path, programIds: [PROGRAM.id], reason: "compiler-membership" as const })),
    workspacePackage: null,
    projectConfig: null,
    inventory: {
      source: "git",
      trackedCommand: ["git", "ls-files", "-z"],
      untrackedCommand: ["git", "ls-files", "--others", "-z"],
      trackedCount: 2,
      untrackedCount: 0,
      authoredCount: 2,
      mergeBase: null,
    },
  };
}

type RunRequest = Extract<PolicyCommandRequest, { readonly mode: "run" }>;

function runRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    mode: "run" as const,
    tier: "changed" as const,
    scope: { kind: "file" as const, paths: ["tooling/src/a.ts"] },
    selector: { kind: "all" as const },
    strictScope: false,
    failOnWarnings: false,
    json: true,
    ...overrides,
  };
}

const LS_FILES_MAX_BUFFER = 268_435_456;

/** Below this the census stopped reading (a wrong cwd, a broken `git ls-files`) rather than measuring a
 *  small repo — and a derivation that stopped reading returns the same empty list as a tree that genuinely
 *  tracks no module scripts, which is exactly how the reality arm below could pass while proving nothing. */
const MIN_TRACKED_SOURCES = 1000;

/** A tracked path the census MUST contain, so a silent mis-read is caught by identity and not only by
 *  count. It is this suite's own subject, which cannot disappear without this file moving with it. */
const ANCHOR_SOURCE = "tooling/src/verify/lib/policy-plan.ts";

/** Tracked repo-relative paths matching `patterns`, sorted. Tracked-ness is the question the planner's
 *  population asks, so an untracked stray must not be able to masquerade as a compiler member here. */
function trackedPaths(root: string, patterns: readonly string[]): readonly string[] {
  return execFileSync("git", ["ls-files", "--", ...patterns], { cwd: root, encoding: "utf8", maxBuffer: LS_FILES_MAX_BUFFER })
    .split("\n")
    .filter((line) => line.trim() !== "")
    .toSorted();
}

test.describe("final policy planner", () => {
  test("the shared source-candidate contract admits only .ts and .tsx", () => {
    expect(policySourceCandidates(["a.mts", "b.cts", "c.mjs", "d.cjs", "e.json", "f.tsx", "g.ts"])).toEqual(["f.tsx", "g.ts"]);
  });

  test("selects checks deterministically and emits exact requested/effective compiler populations", () => {
    const result = planPolicyCommand({
      request: runRequest({ selector: { kind: "check", names: ["z-policy", "a-policy"] } }),
      corpus: { gates: [policy("z-policy"), policy("a-policy")], families: ["a-policy", "z-policy"] },
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        policyIds: ["a-policy", "z-policy"],
        requestedProgramIds: ["tooling/tsconfig.json"],
        requestedPaths: [{ path: "tooling/src/a.ts", status: "present", previousPath: null }],
        policies: [
          {
            policyId: "a-policy",
            mode: "run",
            population: {
              declaredSourcePaths: ["tooling/src/a.ts", "tooling/src/b.ts"],
              requestedPaths: ["tooling/src/a.ts"],
              effectiveSourcePaths: ["tooling/src/a.ts"],
            },
          },
          { policyId: "z-policy", mode: "run" },
        ],
      },
    });
  });

  test("selects a loaded family and defers its entire-population members under a narrow scope", () => {
    const gates = [policy("family-b", { family: "shared", execution: "entire-population" }), policy("family-a", { family: "shared" })];
    const result = planPolicyCommand({
      request: runRequest({ selector: { kind: "family", names: ["shared"] } }),
      corpus: { gates, families: ["shared"] },
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        policies: [
          { policyId: "family-a", mode: "run" },
          { policyId: "family-b", mode: "deferred" },
        ],
      },
    });
  });

  test("strict scope refuses before dispatch when an entire-population policy would defer", () => {
    const result = planPolicyCommand({
      request: runRequest({ strictScope: true }),
      corpus: { gates: [policy("whole", { execution: "entire-population" })], families: ["whole"] },
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    expect(result).toEqual({ ok: false, exitCode: 3, message: expect.stringContaining("whole") });
  });

  test("whole scope runs an entire-population policy and preserves null requested identity", () => {
    const result = planPolicyCommand({
      request: runRequest({ tier: "static", scope: { kind: "whole" }, failOnWarnings: true }),
      corpus: { gates: [policy("whole", { execution: "entire-population", severity: "warning" })], families: ["whole"] },
      scope: scope(["tooling/src/a.ts", "tooling/src/b.ts"]),
    });
    expect(result).toMatchObject({
      ok: true,
      plan: { failOnWarnings: true, policies: [{ mode: "run", population: { requestedPaths: null, effectiveSourcePaths: PROGRAM.files } }] },
    });
  });

  test("an execution-workspace omission cannot enter the planned population through compiler membership alone", () => {
    const gate = policy("workspace-exact");
    const input: Parameters<typeof planPolicyCommand>[0] & { readonly executionWorkspacePaths: readonly string[] } = {
      request: runRequest({ tier: "static", scope: { kind: "whole" } }),
      corpus: { gates: [gate], families: [gate.family] },
      scope: scope(PROGRAM.files),
      // b.ts is a valid authored compiler member but absent from the exact Project the dispatcher will walk.
      executionWorkspacePaths: ["tooling/src/a.ts"],
    };
    const result = planPolicyCommand(input);

    expect(result).toMatchObject({
      ok: true,
      plan: {
        policies: [
          {
            policyId: gate.id,
            population: {
              declaredSourcePaths: ["tooling/src/a.ts"],
              effectiveSourcePaths: ["tooling/src/a.ts"],
            },
          },
        ],
      },
    });
  });

  test("plans and reconciles a provider's independent population before policy execution", () => {
    const provider = defineFact({
      id: "planned-fact",
      population: { in: ["@tooling"], named: ["b.ts"] },
      analysis: "syntax",
      resources: [],
      create: (ctx) => {
        let members = 0;
        return {
          visitFile: () => {
            members += 1;
          },
          finish: () => {
            ctx.receipt({ kind: "population", source: "planned-fact", members });
            return members;
          },
        };
      },
    });
    const gate = policy("fact-policy", {
      execution: "entire-population",
      population: { in: ["@tooling"], named: ["a.ts"] },
      facts: [provider],
      // The consumer's own semantic receipt is mandatory for a fact-declaring policy (#1966).
      create: (ctx) => ({
        evaluate: () => {
          void ctx.fact(provider);
          ctx.receipt({ kind: "population", source: "fact-policy", members: 1 });
        },
      }),
    });
    const corpus = { gates: [gate], families: [gate.family] };

    // REWRITTEN AT #2309: this narrowed arm asserted `deferred`, and the DISPATCHER disagreed. A consumed
    // fact is resolved over its FULL declared population (`resolveFactRuns` ignores `requestedPaths`), so a
    // consumer's census is never partial and can never be its reason to defer — the planner counted the
    // fact's `b.ts` in its completeness denominator anyway, while `resolveRun` counted only source+resources
    // and resolved the same owner `success`. `applyOwnerPlan` turns that disagreement into a thrown tool
    // error, which is why the arm now EXECUTES rather than only planning: agreement is the assertion.
    const narrowed = planPolicyCommand({
      request: runRequest({ scope: { kind: "file", paths: ["tooling/src/a.ts"] } }),
      corpus,
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    expect(narrowed).toMatchObject({
      ok: true,
      plan: { policies: [{ mode: "run", population: { effectiveSourcePaths: ["tooling/src/a.ts"] } }], facts: [{ factId: "planned-fact" }] },
    });
    if (!narrowed.ok || narrowed.plan.mode !== "run") {
      throw new Error("narrowed fact fixture plan did not resolve");
    }
    const narrowedProject = new Project({ useInMemoryFileSystem: true });
    narrowedProject.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    narrowedProject.createSourceFile("/repo/tooling/src/b.ts", "export const b = 1;\n");
    expect(executePolicyPlan({ root: "/repo", project: narrowedProject, corpus, plan: narrowed.plan, reviewedGrants: [] })).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { policies: [{ id: "fact-policy", owner: { status: "success" } }] },
    });

    const planned = planPolicyCommand({ request: runRequest({ scope: { kind: "whole" } }), corpus, scope: scope(PROGRAM.files) });
    expect(planned).toMatchObject({
      ok: true,
      plan: {
        policies: [{ mode: "run", population: { effectiveSourcePaths: ["tooling/src/a.ts"] } }],
        facts: [{ factId: "planned-fact", population: { effectiveSourcePaths: ["tooling/src/b.ts"], requestedPaths: null } }],
      },
    });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("fact fixture plan did not resolve");
    }
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 1;\n");
    const executed = executePolicyPlan({ root: "/repo", project, corpus, plan: planned.plan, reviewedGrants: [] });
    expect(executed).toMatchObject({ ok: true, exitCode: 0, pass: { facts: [{ id: "planned-fact", status: "success" }] } });
  });

  test("resource populations ride the existing per-policy pass seam with exact receipts", () => {
    const resource = policy("resources", { analysis: "resource", population: { of: "none", why: "resource-only" } });
    const result = planPolicyCommand({
      request: runRequest({ scope: { kind: "file", paths: ["tooling/package.json"] } }),
      corpus: { gates: [resource], families: ["resources"] },
      scope: scope(["tooling/package.json"], "file"),
      resourceOptions: {
        root: "/repo",
        overlay: { "tooling/package.json": '{"name":"@orb/tooling","private":true}\n' },
      },
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        resourcePathsByPolicy: { resources: ["tooling/package.json"] },
        policies: [
          {
            mode: "run",
            population: {
              declaredSourcePaths: [],
              declaredResourcePaths: ["tooling/package.json"],
              requestedPaths: ["tooling/package.json"],
              effectiveResourcePaths: ["tooling/package.json"],
            },
          },
        ],
      },
    });
  });

  test.each([
    ["installed-package", { kind: "installed-package", id: "react-compiler", mode: "metadata" }],
    ["authored-path", { kind: "authored-path" }],
  ] as const)("%s resource declarations plan with zero authored resource paths", (_case, request) => {
    const resource = policy(`unpopulated-${_case}`, {
      analysis: "resource",
      resources: [request],
    });
    const result = planPolicyCommand({
      request: runRequest({ tier: "static", scope: { kind: "whole" } }),
      corpus: { gates: [resource], families: [resource.family] },
      scope: scope(PROGRAM.files),
      resourceOptions: { root: "/repo", overlay: {} },
    });

    expect(result).toMatchObject({
      ok: true,
      plan: {
        resourcePathsByPolicy: {},
        policies: [
          {
            policyId: resource.id,
            mode: "run",
            population: {
              declaredSourcePaths: PROGRAM.files,
              declaredResourcePaths: [],
              effectiveSourcePaths: PROGRAM.files,
              effectiveResourcePaths: [],
            },
          },
        ],
      },
    });
  });

  test("plans and executes resource paths in one canonical mixed-case punctuation order", () => {
    const resource = policy("ordered-resources", {
      analysis: "resource",
      population: { of: "none", why: "resource-only" },
      resources: [{ kind: "authored-tree", id: "tooling-slot" }],
      create: (ctx) => ({ evaluate: () => void ctx.resources.authoredTree("tooling-slot") }),
    });
    const corpus = { gates: [resource], families: [resource.family] };
    const overlay = {
      "tooling/src/README.md": "fixture\n",
      "tooling/src/a-file.txt": "fixture\n",
      "tooling/src/Z_file.ts": "export const fixture = true;\n",
    };
    const planned = planPolicyCommand({
      request: runRequest({ tier: "static", scope: { kind: "whole" } }),
      corpus,
      scope: scope(PROGRAM.files),
      resourceOptions: { root: "/repo", overlay },
    });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("ordered resource fixture plan did not resolve");
    }

    expect(
      executePolicyPlan({
        root: "/repo",
        project: new Project({ useInMemoryFileSystem: true }),
        corpus,
        plan: planned.plan,
        reviewedGrants: [],
        resourceOptions: { overlay },
      }),
    ).toMatchObject({ ok: true, exitCode: 0 });
    expect(planned.plan.resourcePathsByPolicy[resource.id]).toEqual(["tooling/src/README.md", "tooling/src/Z_file.ts", "tooling/src/a-file.txt"]);
  });

  test("resolves resource manifests only for selected policies", () => {
    const selected = policy("selected");
    const unselected = policy("unselected-resource", { analysis: "resource", population: { of: "none", why: "resource-only" } });
    expect(
      planPolicyCommand({
        request: runRequest({ selector: { kind: "check", names: [selected.id] } }),
        corpus: { gates: [unselected, selected], families: [selected.family, unselected.family] },
        scope: scope(["tooling/src/a.ts"], "file"),
      }),
    ).toMatchObject({ ok: true, plan: { policyIds: [selected.id], resourcePathsByPolicy: {} } });
  });

  // REWRITTEN AT #2309, INTENT PRESERVED. The generic hybrid still pins that a compiler-member `.mts` is a
  // RESOURCE identity and never a SOURCE one, in every scope kind. What it used to pin BESIDE that was the
  // defect: under the three narrowed kinds it asserted `effectiveSourcePaths: []` with `mode: "run"` — a
  // policy scheduled to render a verdict over zero subjects because its resource identity alone was selected.
  // The corrected semantics say a changed declared RESOURCE reselects the full declared SOURCE population and
  // hands the owner its complete resource declaration, so all four kinds now agree on both fields.
  test.each([
    ["whole", { kind: "whole" }],
    ["file", { kind: "file", paths: ["tooling/src/module.mts"] }],
    ["project", { kind: "project", config: "tooling/tsconfig.json" }],
    ["changed", { kind: "changed" }],
  ] as const)("%s scope excludes compiler-member .mts from source while retaining its declared resource identity", (_case, request) => {
    const currentPaths = request.kind === "whole" ? ["tooling/src/a.ts", "tooling/src/module.mts"] : ["tooling/src/module.mts"];
    const semanticPaths = currentPaths.map((path) => ({ path, status: "present" as const, previousPath: null }));
    const resolved: PolicyScopeResolution = {
      ...scope(currentPaths, request.kind === "whole" ? "whole" : "file"),
      request,
      kind: request.kind,
      requestedPaths: request.kind === "whole" ? null : semanticPaths,
      semanticPaths: request.kind === "whole" ? [] : semanticPaths,
      currentPaths,
      programs: [{ ...PROGRAM, files: ["tooling/src/a.ts", "tooling/src/module.mts"] }],
      ownership: semanticPaths.map((path) => ({ ...path, programIds: [PROGRAM.id], reason: "compiler-membership" as const })),
      projectConfig: request.kind === "project" ? "tooling/tsconfig.json" : null,
    };
    const hybrid = policy("hybrid", {
      analysis: "resource",
      population: "@tooling",
      resources: [{ kind: "authored-tree", id: "tooling-slot" }],
    });
    const result = planPolicyCommand({
      request: runRequest({ scope: request }),
      corpus: { gates: [hybrid], families: [hybrid.family] },
      scope: resolved,
      resourceOptions: {
        root: "/repo",
        overlay: { "tooling/src/a.ts": "export const a = 1;\n", "tooling/src/module.mts": "export const moduleValue = 1;\n" },
      },
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        policies: [
          {
            mode: "run",
            population: {
              declaredSourcePaths: ["tooling/src/a.ts"],
              declaredResourcePaths: ["tooling/src/a.ts", "tooling/src/module.mts"],
              effectiveSourcePaths: ["tooling/src/a.ts"],
              effectiveResourcePaths: ["tooling/src/a.ts", "tooling/src/module.mts"],
            },
          },
        ],
      },
    });
  });

  test.each([
    ["missing", null],
    ["empty", ""],
    ["unresolved", "{broken"],
  ] as const)("resource planning fails closed on a %s declared fact", (_case, content) => {
    const resource = policy("resources", { analysis: "resource", population: { of: "none", why: "resource-only" } });
    const result = planPolicyCommand({
      request: runRequest({ scope: { kind: "file", paths: ["tooling/package.json"] } }),
      corpus: { gates: [resource], families: [resource.family] },
      scope: scope(["tooling/package.json"], "file"),
      resourceOptions: { root: "/repo", overlay: { "tooling/package.json": content } },
    });
    expect(result).toMatchObject({ ok: false, exitCode: 2, message: expect.stringMatching(new RegExp(_case)) });
  });

  test.each([
    [runRequest({ selector: { kind: "check", names: ["missing"] } }), /unknown check/i, undefined],
    [runRequest({ selector: { kind: "family", names: ["missing"] } }), /unknown family/i, undefined],
    [runRequest({ selector: { kind: "check", names: [] } }), /must not be empty/i, undefined],
    [runRequest(), /resource/i, policy("resource-empty", { analysis: "resource", population: { of: "none", why: "resource-only" } })],
  ] as const)("fails closed on unknown or empty selections %#", (request, message, selected) => {
    const gate = selected ?? policy("known");
    expect(planPolicyCommand({ request, corpus: { gates: [gate], families: [gate.family] }, scope: scope(["tooling/src/a.ts"], "file") })).toMatchObject({
      ok: false,
      message: expect.stringMatching(message),
    });
  });

  test("fails closed when a source population resolves empty", () => {
    expect(
      planPolicyCommand({
        request: runRequest(),
        corpus: { gates: [policy("empty-source", { population: "@client" })], families: ["empty-source"] },
        scope: scope(["tooling/src/a.ts"], "file"),
      }),
    ).toMatchObject({ ok: false, exitCode: 2, message: expect.stringMatching(/zero paths|population/i) });
  });

  test("deleted scope identity remains requested while effective populations skip current work", () => {
    const deletedScope = scope([], "file");
    const semantic = [{ path: "tooling/src/a.ts", status: "deleted" as const, previousPath: null }];
    const result = planPolicyCommand({
      request: runRequest(),
      corpus: { gates: [policy("known")], families: ["known"] },
      scope: {
        ...deletedScope,
        request: { kind: "file", paths: ["tooling/src/a.ts"] },
        requestedPaths: semantic,
        semanticPaths: semantic,
        ownership: [
          {
            path: "tooling/src/a.ts",
            status: "deleted",
            previousPath: null,
            programIds: [PROGRAM.id],
            reason: "deleted-conservative-all-programs",
          },
        ],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        requestedPaths: semantic,
        policies: [{ mode: "skipped", population: { requestedPaths: ["tooling/src/a.ts"], effectiveSourcePaths: [] } }],
      },
    });
  });

  test.each([
    ["deleted", [{ path: "tooling/src/a.ts", status: "deleted" as const, previousPath: null }], []],
    [
      "renamed outside",
      [
        { path: "tooling/src/a.ts", status: "deleted" as const, previousPath: null },
        { path: "docs/a.md", status: "renamed-existing" as const, previousPath: "tooling/src/a.ts" },
      ],
      ["docs/a.md"],
    ],
  ] as const)("strict scope refuses an entire-population policy when an in-population identity was %s", (_case, semanticPaths, currentPaths) => {
    const survivingProgram = { ...PROGRAM, files: ["tooling/src/b.ts"] };
    const resolved: PolicyScopeResolution = {
      ...scope(currentPaths, "file"),
      request: { kind: "changed" },
      kind: "changed",
      requestedPaths: semanticPaths,
      semanticPaths,
      programs: [survivingProgram],
      ownership: semanticPaths.map((path) => ({
        ...path,
        programIds: path.status === "deleted" ? [PROGRAM.id] : [],
        reason: path.status === "deleted" ? ("deleted-conservative-all-programs" as const) : ("outside-compiler-programs" as const),
      })),
    };
    const gate = policy("whole-policy", { execution: "entire-population" });
    const corpus = { gates: [gate], families: [gate.family] };

    expect(
      planPolicyCommand({
        request: runRequest({ scope: { kind: "changed" }, strictScope: true }),
        corpus,
        scope: resolved,
      }),
    ).toEqual({ ok: false, exitCode: 3, message: "strict scope refuses entire-population policies: whole-policy" });
    const nonStrict = planPolicyCommand({
      request: runRequest({ scope: { kind: "changed" } }),
      corpus,
      scope: resolved,
    });
    expect(nonStrict).toMatchObject({ ok: true, plan: { policies: [{ policyId: "whole-policy", mode: "deferred" }] } });
    if (!nonStrict.ok || nonStrict.plan.mode !== "run") {
      throw new Error("deferred fixture plan did not resolve");
    }
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");
    expect(executePolicyPlan({ root: "/repo", project, corpus, plan: nonStrict.plan, reviewedGrants: [] })).toMatchObject({
      ok: true,
      pass: {
        policies: [
          {
            id: "whole-policy",
            owner: { status: "not-applicable", reason: "entire-population policy requires its complete declared population" },
          },
        ],
      },
    });
  });

  test("strict scope skips an entire source policy for a non-source path under the same root", () => {
    const semanticPaths = [{ path: "tooling/src/verify/data.json", status: "modified" as const, previousPath: null }];
    const resolved: PolicyScopeResolution = {
      ...scope(["tooling/src/verify/data.json"], "file"),
      request: { kind: "changed" },
      kind: "changed",
      requestedPaths: semanticPaths,
      semanticPaths,
      programs: [{ ...PROGRAM, files: ["tooling/src/b.ts"] }],
      ownership: [
        {
          path: "tooling/src/verify/data.json",
          status: "modified",
          previousPath: null,
          programIds: [],
          reason: "outside-compiler-programs",
        },
      ],
    };
    const gate = policy("whole-policy", { execution: "entire-population" });
    expect(
      planPolicyCommand({
        request: runRequest({ scope: { kind: "changed" }, strictScope: true }),
        corpus: { gates: [gate], families: [gate.family] },
        scope: resolved,
      }),
    ).toMatchObject({ ok: true, plan: { policies: [{ policyId: "whole-policy", mode: "skipped" }] } });
  });

  test("planner touch and population membership exclude module-script extensions", () => {
    const sourceFiles = [
      "tooling/src/live.ts",
      "tooling/src/ignored.mts",
      "tooling/src/ignored.cts",
      "tooling/src/ignored.mjs",
      "tooling/src/ignored.cjs",
      "tooling/src/ignored.js",
      "tooling/src/ignored.jsx",
    ];
    const program = { ...PROGRAM, files: sourceFiles };
    const gate = policy("source-universe", { execution: "entire-population" });
    const corpus = { gates: [gate], families: [gate.family] };
    const plannedScope = (currentPaths: readonly string[]): PolicyScopeResolution => ({
      ...scope(currentPaths, "file"),
      request: { kind: "changed" },
      kind: "changed",
      programs: [program],
      requestedPaths: currentPaths.map((path) => ({ path, status: "modified" as const, previousPath: null })),
      semanticPaths: currentPaths.map((path) => ({ path, status: "modified" as const, previousPath: null })),
      ownership: currentPaths.map((path) => ({
        path,
        status: "modified" as const,
        previousPath: null,
        programIds: [program.id],
        reason: "compiler-membership" as const,
      })),
    });

    const mtsOnly = planPolicyCommand({
      request: runRequest({ scope: { kind: "changed" }, strictScope: true }),
      corpus,
      scope: plannedScope(["tooling/src/ignored.mts"]),
    });
    expect(mtsOnly).toMatchObject({
      ok: true,
      plan: {
        policies: [
          {
            mode: "skipped",
            population: { declaredSourcePaths: ["tooling/src/live.ts"], effectiveSourcePaths: [] },
          },
        ],
      },
    });

    const mixed = planPolicyCommand({
      request: runRequest({ scope: { kind: "changed" } }),
      corpus,
      scope: plannedScope(sourceFiles),
    });
    expect(mixed).toMatchObject({
      ok: true,
      plan: {
        policies: [
          {
            mode: "run",
            population: {
              declaredSourcePaths: ["tooling/src/live.ts"],
              effectiveSourcePaths: ["tooling/src/live.ts"],
            },
          },
        ],
      },
    });
  });

  test("replacement and rename semantics stay lossless while pass-facing requested paths are a set", () => {
    const semantic = [
      { path: "tooling/src/a.ts", status: "deleted" as const, previousPath: null },
      { path: "tooling/src/a.ts", status: "added" as const, previousPath: null },
      { path: "tooling/src/b.ts", status: "renamed-existing" as const, previousPath: "tooling/src/old-b.ts" },
    ];
    const resolved = scope(["tooling/src/a.ts", "tooling/src/b.ts"], "file");
    const result = planPolicyCommand({
      request: runRequest({ scope: { kind: "file", paths: ["tooling/src/a.ts", "tooling/src/b.ts"] } }),
      corpus: { gates: [policy("known")], families: ["known"] },
      scope: {
        ...resolved,
        requestedPaths: semantic,
        semanticPaths: semantic,
        ownership: [
          {
            path: "tooling/src/a.ts",
            status: "deleted",
            previousPath: null,
            programIds: [PROGRAM.id],
            reason: "deleted-conservative-all-programs",
          },
          {
            path: "tooling/src/a.ts",
            status: "added",
            previousPath: null,
            programIds: [PROGRAM.id],
            reason: "compiler-membership",
          },
          {
            path: "tooling/src/b.ts",
            status: "renamed-existing",
            previousPath: "tooling/src/old-b.ts",
            programIds: [PROGRAM.id],
            reason: "compiler-membership",
          },
        ],
      },
    });

    expect(result).toMatchObject({
      ok: true,
      plan: {
        requestedPaths: semantic,
        policies: [
          {
            population: {
              requestedPaths: ["tooling/src/a.ts", "tooling/src/b.ts"],
              effectiveSourcePaths: ["tooling/src/a.ts", "tooling/src/b.ts"],
            },
          },
        ],
      },
    });
  });

  test("fails closed when a selected TypeScript path has no compiler membership", () => {
    expect(
      planPolicyCommand({
        request: runRequest(),
        corpus: { gates: [policy("known")], families: ["known"] },
        scope: { ...scope(["tooling/src/a.ts"], "file"), programs: [], requestedProgramIds: [], ownership: [] },
      }),
    ).toMatchObject({ ok: false, exitCode: 2, message: expect.stringMatching(/compiler|program/i) });
  });

  test("list and explain derive stable JSON-ready rows from the loaded corpus", () => {
    const rosterFact = defineFact({
      id: "roster-fact",
      population: "@tooling",
      analysis: "syntax",
      resources: [],
      create: (ctx) => ({
        finish: () => {
          ctx.receipt({ kind: "population", source: "roster-fact", members: 1 });
          return true;
        },
      }),
    });
    const gates = [
      defineGate({
        ...policy("z-policy", { family: "shared", analysis: "resource", population: { of: "none", why: "resource-only" } }),
        mustRefuse: [
          {
            mode: "resource",
            files: { "tooling/package.json": "{}\n" },
            expect: { messageIncludes: "fixture refusal" },
            why: "unsupported input must refuse",
          },
        ],
      }),
      policy("a-policy", { family: "shared", severity: "warning", execution: "entire-population", facts: [rosterFact] }),
    ];
    const list = planPolicyCommand({ request: { mode: "list", json: true }, corpus: { gates, families: ["shared"] } });
    expect(list).toMatchObject({
      ok: true,
      plan: {
        policies: [
          { id: "a-policy", workItem: 1584, facts: ["roster-fact"], resources: [], proofCounts: { mustFlag: 1, mustPass: 1, mustRefuse: 0 } },
          {
            id: "z-policy",
            workItem: null,
            facts: [],
            resources: [{ kind: "package-metadata", id: "tooling" }],
            proofCounts: { mustFlag: 1, mustPass: 1, mustRefuse: 1 },
          },
        ],
        families: ["shared"],
      },
    });
    const reordered = planPolicyCommand({ request: { mode: "list", json: true }, corpus: { gates: gates.toReversed(), families: ["shared"] } });
    expect(JSON.stringify(reordered)).toBe(JSON.stringify(list));
    const explain = planPolicyCommand({
      request: { mode: "explain", selector: { kind: "check", names: ["z-policy"] }, json: true },
      corpus: { gates, families: ["shared"] },
    });
    expect(explain).toMatchObject({
      ok: true,
      plan: {
        policies: [
          {
            id: "z-policy",
            resources: [{ kind: "package-metadata", id: "tooling" }],
            proofCounts: { mustFlag: 1, mustPass: 1, mustRefuse: 1 },
          },
        ],
      },
    });
  });

  test("unknown-selection diagnostics sort equivalent bad requests", () => {
    const gate = policy("known");
    const corpus = { gates: [gate], families: [gate.family] };
    const first = planPolicyCommand({
      request: runRequest({ selector: { kind: "check", names: ["z-missing", "a-missing"] } }),
      corpus,
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    const second = planPolicyCommand({
      request: runRequest({ selector: { kind: "check", names: ["a-missing", "z-missing"] } }),
      corpus,
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: false, exitCode: 3, message: "unknown check selection(s): a-missing, z-missing" });
  });

  test("the argv coordinator resolves a real six-kind scope through the programmatic front door", { timeout: scaledBudget(5000) }, ({ repoRoot }) => {
    const gate = policy("known");
    const result = planPolicyArgv(repoRoot, ["--file", "tooling/src/verify/lib/policy-plan.ts", "--check", gate.id], {
      gates: [gate],
      families: [gate.family],
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        mode: "run",
        policyIds: [gate.id],
        requestedPaths: [{ path: "tooling/src/verify/lib/policy-plan.ts", status: "present", previousPath: null }],
        policies: [{ population: { effectiveSourcePaths: ["tooling/src/verify/lib/policy-plan.ts"] } }],
      },
    });
  });

  // THE REALITY ARM for the owner ruling the five synthetic scope rows above prove against a fixture
  // corpus: the final AST/compiler population is `.ts`/`.tsx` ONLY, and a compiler-owned module script
  // must not reach a policy's source population. The receipt is the 2026-09-05 resource-layout-size
  // inventory under `docs/reviews/stickler/`, where a real `.mts` once landed in both
  // `declaredSourcePaths` and `effectiveSourcePaths`. (The filename is deliberately NOT spelled across
  // a line break: `dangling-doc-cite` is hard/no-waiver and reads a wrapped path's TAIL fragment as a
  // citation in its own right, so a wrapped doc path reds on a document that resolves perfectly.)
  //
  // ITS SUBJECT IS DERIVED, because the hardcoded one ROTTED. This arm used to name
  // `tests/server/infra/providers/backends/local-light/fixtures/orphan-survival-child.mts` by literal;
  // that fixture went with the `@orb/inference` cut-over (146f71cd5, 2026-09-19) and the arm then asserted
  // a path that no longer existed — it failed for a missing file rather than for the fence it is named
  // for, and nothing swept it.
  //
  // READ THIS BEFORE TRUSTING ITS GREEN: the repository tracks ZERO `.mts`/`.cts` today, so the PLANNER
  // loop below currently has no subject and is vacuous. That is a DERIVED empty, not an asserted one
  // (constitution §4), and it is deliberately left self-engaging rather than deleted — the day a module
  // script lands, this arm judges it with no edit. What still runs on EVERY tree is the census control
  // and the contract assertion; the fence's behavioural proof is the synthetic scope rows above.
  test("no tracked compiler-member module script enters policy source population", { timeout: scaledBudget(5000) }, ({ repoRoot }) => {
    const sources = trackedPaths(repoRoot, ["*.ts", "*.tsx"]);
    // POSITIVE CONTROL, same invocation, same machinery as the module-script census below: without it a
    // broken `git ls-files` yields an empty module-script list that reads exactly like a clean pass.
    expect(sources).toContain(ANCHOR_SOURCE);
    expect(sources.length).toBeGreaterThan(MIN_TRACKED_SOURCES);

    const moduleScripts = trackedPaths(repoRoot, ["*.mts", "*.cts"]);
    // Runs empty census or not: every tracked module script is dropped while a real tracked source
    // survives, so the extension fence is asserted against the REAL tree on every run.
    expect(policySourceCandidates([...moduleScripts, ANCHOR_SOURCE])).toEqual([ANCHOR_SOURCE]);

    for (const modulePath of moduleScripts) {
      const gate = policy("real-module-script-source-fence", { population: "@tests" });
      const result = planPolicyArgv(repoRoot, ["--file", modulePath, "--check", gate.id], { gates: [gate], families: [gate.family] });
      expect(result).toMatchObject({
        ok: true,
        plan: {
          requestedPaths: [{ path: modulePath, status: "present", previousPath: null }],
          policies: [{ mode: "skipped", population: { effectiveSourcePaths: [] } }],
        },
      });
      if (!result.ok || result.plan.mode !== "run") {
        throw new Error(`module-script plan did not resolve: ${modulePath}`);
      }
      expect(result.plan.policies[0]?.population.declaredSourcePaths).not.toContain(modulePath);
    }
  });

  test("executes a plan through the production pass and refuses project/population drift", () => {
    const gate = policy("known");
    const corpus = { gates: [gate], families: [gate.family] };
    const planned = planPolicyCommand({ request: runRequest(), corpus, scope: scope(["tooling/src/a.ts"], "file") });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("fixture plan did not resolve");
    }
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");

    expect(executePolicyPlan({ root: "/repo", project, corpus, plan: planned.plan, reviewedGrants: [] })).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { policies: [{ id: "known", owner: { status: "success" } }] },
    });

    const incompleteProject = new Project({ useInMemoryFileSystem: true });
    incompleteProject.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    expect(executePolicyPlan({ root: "/repo", project: incompleteProject, corpus, plan: planned.plan, reviewedGrants: [] })).toMatchObject({
      ok: false,
      exitCode: 2,
      message: expect.stringMatching(/population.*plan/i),
    });
  });

  test("execution carries the full known roster into ordinary-waiver adjudication", () => {
    const selected = policy("selected-hard");
    const unselected = defineGate({ ...policy("known-ordinary"), authority: "ordinary" });
    const reviewed = defineGate({
      ...policy("known-reviewed"),
      authority: "reviewed-grant",
      mustFlag: [
        {
          mode: "source",
          files: { "tooling/src/a.ts": "export const a = 1;\n" },
          grant: { subject: "subject", operation: "read" },
          why: "the known unselected owner must withhold grant liveness",
        },
      ],
    });
    const corpus = { gates: [selected, unselected, reviewed], families: [selected.family, unselected.family, reviewed.family] };
    const planned = planPolicyCommand({
      request: runRequest({ selector: { kind: "check", names: [selected.id] } }),
      corpus,
      scope: scope(["tooling/src/a.ts"], "file"),
    });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("full-roster fixture plan did not resolve");
    }
    const plan = planned.plan;
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile(
      "/repo/tooling/src/a.ts",
      [
        "// @orb-waive missing-policy(value): unknown policy must stay loud",
        "// @orb-waive known-ordinary(value): unselected liveness is withheld",
        "export const value = 1;",
      ].join("\n"),
    );
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");

    const result = executePolicyPlan({ root: "/repo", project, corpus, plan: planned.plan, reviewedGrants: [] });

    expect(result).toMatchObject({
      ok: true,
      exitCode: 1,
      pass: { authority: { authorityAlarms: [{ policyId: "missing-policy", message: expect.stringMatching(/unknown policy/i) }] } },
    });
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.pass.authority.authorityAlarms).toHaveLength(1);

    const cleanProject = new Project({ useInMemoryFileSystem: true });
    cleanProject.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    cleanProject.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");
    const grant = { id: "grant", policyId: reviewed.id, subject: "subject", operation: "read", why: "fixture", endsWhen: "the owner runs" };
    const executeGrants = (reviewedGrants: readonly (typeof grant)[]): ReturnType<typeof executePolicyPlan> =>
      executePolicyPlan({ root: "/repo", project: cleanProject, corpus, plan, reviewedGrants });

    expect(executeGrants([{ ...grant, policyId: "missing-policy" }])).toMatchObject({
      ok: true,
      exitCode: 2,
      pass: { authority: { toolErrors: [{ kind: "invalid-grant", policyId: "missing-policy" }] } },
    });
    expect(executeGrants([{ ...grant, policyId: selected.id }])).toMatchObject({
      ok: true,
      exitCode: 2,
      pass: { authority: { toolErrors: [{ kind: "invalid-grant-authority", policyId: selected.id }] } },
    });
    expect(executeGrants([grant])).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { authority: { authorityAlarms: [], reviewedGrantConsumption: [{ id: grant.id, count: 0 }] } },
    });
  });

  test("executes ResourceHost acquisition through the bound policy context", () => {
    const resource = defineGate({
      id: "resource-host",
      family: "resource-host",
      authority: "hard",
      severity: "error",
      population: { of: "none", why: "resource-only" },
      analysis: "resource",
      execution: "selected-files",
      facts: [],
      resources: [{ kind: "package-metadata", id: "tooling" }],
      message: "resource host must resolve",
      create: (ctx) => ({
        evaluate: () => {
          const fact = ctx.resources.packageMetadata("tooling");
          if (fact.status !== "ready") {
            throw new Error(fact.reason);
          }
        },
      }),
      mustFlag: [{ mode: "resource", files: { "tooling/package.json": "{}\n" }, why: "founding defect" }],
      mustPass: [{ mode: "resource", files: { "tooling/package.json": "{}\n" }, why: "nearest legal shape" }],
    });
    const corpus = { gates: [resource], families: [resource.family] };
    const resolved = scope(["tooling/package.json"], "file");
    const planned = planPolicyCommand({
      request: runRequest({ scope: { kind: "file", paths: ["tooling/package.json"] } }),
      corpus,
      scope: resolved,
      resourceOptions: {
        root: "/repo",
        overlay: { "tooling/package.json": '{"name":"@orb/tooling","private":true}\n' },
      },
    });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error("resource fixture plan did not resolve");
    }

    expect(
      executePolicyPlan({
        root: "/repo",
        project: new Project({ useInMemoryFileSystem: true }),
        corpus,
        plan: planned.plan,
        reviewedGrants: [],
        resourceOptions: { overlay: { "tooling/package.json": '{"name":"@orb/tooling","private":true}\n' } },
      }),
    ).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { policies: [{ receipts: [{ kind: "resource", source: "package:tooling", resources: 1, unresolved: 0 }] }] },
    });

    expect(
      executePolicyPlan({
        root: "/repo",
        project: new Project({ useInMemoryFileSystem: true }),
        corpus,
        plan: { ...planned.plan, resourcePathsByPolicy: {} },
        reviewedGrants: [],
        resourceOptions: { overlay: { "tooling/package.json": '{"name":"@orb/tooling","private":true}\n' } },
      }),
    ).toMatchObject({ ok: false, exitCode: 2, message: expect.stringMatching(/resource manifest.*planned populations/i) });
  });

  test("warning findings stay visible and block only when promotion is requested", () => {
    const warning = defineGate({
      ...policy("warning-policy", { severity: "warning" }),
      create: (ctx) => ({ evaluate: () => ctx.report.file("tooling/src/a.ts", { line: 1, column: 1 }) }),
    });
    const corpus = { gates: [warning], families: [warning.family] };
    const resolved = scope(["tooling/src/a.ts"], "file");
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile("/repo/tooling/src/a.ts", "export const a = 1;\n");
    project.createSourceFile("/repo/tooling/src/b.ts", "export const b = 2;\n");
    const execute = (failOnWarnings: boolean): ReturnType<typeof executePolicyPlan> => {
      const planned = planPolicyCommand({ request: runRequest({ failOnWarnings }), corpus, scope: resolved });
      if (!planned.ok || planned.plan.mode !== "run") {
        throw new Error("warning fixture plan did not resolve");
      }
      return executePolicyPlan({ root: "/repo", project, corpus, plan: planned.plan, reviewedGrants: [] });
    };

    expect(execute(false)).toMatchObject({
      ok: true,
      exitCode: 0,
      pass: { authority: { effectiveFindings: [{ policyId: "warning-policy", severity: "warning" }], verdict: { warnings: 1, blocking: 0 } } },
    });
    expect(execute(true)).toMatchObject({ ok: true, exitCode: 1, pass: { authority: { verdict: { warnings: 1, blocking: 1 } } } });
  });

  test("maps completed policy results onto the stable exit classes", () => {
    const result = {
      facts: [],
      policies: [],
      factErrors: [],
      toolErrors: [],
      waiverCarrierRefusals: [],
      authority: {
        effectiveFindings: [],
        waivedFindings: [],
        grantedFindings: [],
        authorityAlarms: [],
        toolErrors: [],
        withheldPolicyIds: [],
        ordinaryConsumption: [],
        reviewedGrantConsumption: [],
        verdict: { errors: 0, warnings: 0, blocking: 0, failOnWarnings: false },
      },
      timing: { totalMs: 0, policyMs: 0, factMs: 0 },
    } satisfies PolicyPassResult;
    expect(policyPassExitCode(result)).toBe(0);
    expect(policyPassExitCode({ ...result, authority: { ...result.authority, verdict: { ...result.authority.verdict, blocking: 1 } } })).toBe(1);
    expect(policyPassExitCode({ ...result, toolErrors: [{ policyId: "x", phase: "create", message: "boom" }] })).toBe(2);
    expect(policyPassExitCode({ ...result, factErrors: [{ factId: "x", phase: "finish", message: "boom" }] })).toBe(2);
  });
});
