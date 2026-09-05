import type { GatePolicy, PolicyCommandRequest, PolicyPassResult, PolicyScopeResolution } from "@orb/tooling/verify";
import { defineGate, executePolicyPlan, planPolicyArgv, planPolicyCommand, policyPassExitCode } from "@orb/tooling/verify";
import { Project, SyntaxKind } from "ts-morph";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

function policy(id: string, options: Partial<Pick<GatePolicy, "family" | "execution" | "analysis" | "population" | "severity">> = {}): GatePolicy {
  const analysis = options.analysis ?? "syntax";
  const proofMode = analysis === "syntax" ? "source" : analysis;
  const files = analysis === "resource" ? { "tooling/package.json": "{}\n" } : { "tooling/src/a.ts": "export const a = 1;\n" };
  const base = {
    id,
    family: options.family ?? id,
    authority: "hard",
    population: options.population ?? "@tooling",
    analysis,
    execution: options.execution ?? "selected-files",
    message: `${id} message`,
    create: () => ({ visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: (): void => undefined }] }),
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

test.describe("final policy planner", () => {
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

  test("resource populations ride the existing per-policy pass seam with exact receipts", () => {
    const resource = policy("resources", { analysis: "resource", population: { of: "none", why: "resource-only" } });
    const result = planPolicyCommand({
      request: runRequest({ scope: { kind: "file", paths: ["tooling/package.json"] } }),
      corpus: { gates: [resource], families: ["resources"] },
      scope: scope(["tooling/package.json"], "file"),
      resourcePathsByPolicy: new Map([["resources", ["tooling/package.json", "tooling/pnpm-lock.yaml"]]]),
    });
    expect(result).toMatchObject({
      ok: true,
      plan: {
        resourcePathsByPolicy: { resources: ["tooling/package.json", "tooling/pnpm-lock.yaml"] },
        policies: [
          {
            mode: "run",
            population: {
              declaredSourcePaths: [],
              declaredResourcePaths: ["tooling/package.json", "tooling/pnpm-lock.yaml"],
              requestedPaths: ["tooling/package.json"],
              effectiveResourcePaths: ["tooling/package.json"],
            },
          },
        ],
      },
    });
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

  test("fails closed when a source population resolves empty or a resource manifest names no loaded owner", () => {
    expect(
      planPolicyCommand({
        request: runRequest(),
        corpus: { gates: [policy("empty-source", { population: "@client" })], families: ["empty-source"] },
        scope: scope(["tooling/src/a.ts"], "file"),
      }),
    ).toMatchObject({ ok: false, exitCode: 2, message: expect.stringMatching(/zero paths|population/i) });
    expect(
      planPolicyCommand({
        request: runRequest(),
        corpus: { gates: [policy("known")], families: ["known"] },
        scope: scope(["tooling/src/a.ts"], "file"),
        resourcePathsByPolicy: new Map([["missing", ["tooling/package.json"]]]),
      }),
    ).toMatchObject({ ok: false, exitCode: 2, message: expect.stringMatching(/unknown policy/i) });
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
    const gates = [policy("z-policy", { family: "shared" }), policy("a-policy", { family: "shared", severity: "warning" })];
    const list = planPolicyCommand({ request: { mode: "list", json: true }, corpus: { gates, families: ["shared"] } });
    expect(list).toMatchObject({
      ok: true,
      plan: {
        policies: [
          { id: "a-policy", workItem: 1584 },
          { id: "z-policy", workItem: null },
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
    expect(explain).toMatchObject({ ok: true, plan: { policies: [{ id: "z-policy", proofCounts: { mustFlag: 1, mustPass: 1 } }] } });
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

  test("executes ResourceHost acquisition through the bound policy context", () => {
    const resource = defineGate({
      id: "resource-host",
      family: "resource-host",
      authority: "hard",
      severity: "error",
      population: { of: "none", why: "resource-only" },
      analysis: "resource",
      execution: "selected-files",
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
      resourcePathsByPolicy: new Map([[resource.id, ["tooling/package.json"]]]),
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
  });

  test("warning findings stay visible and block only when promotion is requested", () => {
    const warning = defineGate({
      ...policy("warning-policy", { severity: "warning" }),
      create: (ctx) => ({ evaluate: () => ctx.report.file("tooling/src/a.ts") }),
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
      policies: [],
      toolErrors: [],
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
      timing: { totalMs: 0, policyMs: 0 },
    } satisfies PolicyPassResult;
    expect(policyPassExitCode(result)).toBe(0);
    expect(policyPassExitCode({ ...result, authority: { ...result.authority, verdict: { ...result.authority.verdict, blocking: 1 } } })).toBe(1);
    expect(policyPassExitCode({ ...result, toolErrors: [{ policyId: "x", phase: "create", message: "boom" }] })).toBe(2);
  });
});
