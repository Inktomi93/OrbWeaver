import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resourceUsage } from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { vi } from "vitest";
import { TOKEN_GENERATED_TYPE_PATHS } from "../../../../tooling/src/verify/contract/resource-artifact.ts";
import { JSON_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-json.ts";
import { gate as aliases } from "../../../../tooling/src/verify/gates/no-inline-types.ts";
import { planPolicyCommand } from "../../../../tooling/src/verify/lib/policy-plan.ts";
import { normalizePathSet } from "../../../../tooling/src/verify/lib/policy-validation.ts";
import { repoRel } from "../../../../tooling/src/verify/lib/project-context.ts";
import { prepareTokenTypeGeneration, tokenTypeGenerationOwner } from "../../../../tooling/src/verify/ops/gen/theme-css.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { policy } from "./_policy-plan-fixture.ts";

test("native roots and compiler paths reconcile into exact repository identities", () => {
  expect(repoRel("D:\\a\\orbweaver", "D:/a/orbweaver/tooling/src/example.ts")).toBe("tooling/src/example.ts");
  expect(repoRel("/checkout/orbweaver/", "/checkout/orbweaver/tooling/src/example.ts")).toBe("tooling/src/example.ts");
  expect(normalizePathSet([repoRel("D:\\a\\orbweaver", "D:/a/orbweaver/tests/example.test.ts")], "execution workspace path")).toEqual([
    "tests/example.test.ts",
  ]);
});

test("a similarly prefixed sibling is outside the execution workspace, never a relative member", () => {
  const outside = repoRel("/checkout/orbweaver", "/checkout/orbweaver-other/tooling/src/example.ts");
  expect(outside).toBe("../orbweaver-other/tooling/src/example.ts");
  expect(() => normalizePathSet([outside], "execution workspace path")).toThrow("execution workspace path has an invalid segment");
});

test("unrelated source or policy selections do not demand a native owner or token generation", async ({ scratch }) => {
  const context = {
    root: scratch,
    project: new Project({ useInMemoryFileSystem: true }),
    files: [],
    nativeSourceView: (): never => {
      throw new Error("unexpected native demand");
    },
  };
  const unrelated = "packages/server/src/domain/x/read.ts";
  context.project.createSourceFile(join(scratch, unrelated), "export const read=1;");
  for (const path of TOKEN_GENERATED_TYPE_PATHS) {
    context.project.createSourceFile(join(scratch, path), "export const token=1;");
  }
  const input = { root: scratch, project: context.project, policies: [aliases], knownPolicies: [aliases], reviewedGrants: [], failOnWarnings: false };
  expect(await prepareTokenTypeGeneration(context, tokenTypeGenerationOwner({ ...input, requestedPaths: [unrelated] }))).toBeUndefined();
  expect(
    await prepareTokenTypeGeneration(context, tokenTypeGenerationOwner({ ...input, policies: [], requestedPaths: TOKEN_GENERATED_TYPE_PATHS })),
  ).toBeUndefined();
  expect(
    await prepareTokenTypeGeneration(
      { root: context.root, project: context.project, files: context.files },
      tokenTypeGenerationOwner({ ...input, requestedPaths: TOKEN_GENERATED_TYPE_PATHS }),
    ),
  ).toMatchObject({
    status: "missing",
  });
});

test(
  "production structure delivers only the canonical Node producer and UI output worlds without writing artifacts",
  async ({ repoRoot }) => {
    const tokenBuild = await import("@orb/ui/tokens-build");
    const nativeWorkspace = await import("../../../../tooling/src/floor/compiler/ts-workspace.ts");
    const before = new Map(TOKEN_GENERATED_TYPE_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")]));
    const registered = vi.spyOn(nativeWorkspace, "registeredSemanticSourceView");
    const generated = vi.spyOn(tokenBuild, "generateArtifacts");
    const started = performance.now();
    let code: number;
    try {
      code = await runStructure(repoRoot, ["--check=no-inline-types", "--file=packages/ui/src/tokens/index.ts", "--file=packages/ui/src/tokens/themes.gen.ts"]);
      expect(code).toBe(0);
      expect(generated).toHaveBeenCalledTimes(1);
      const descriptors = [
        ...new Set(
          registered.mock.results.flatMap((result) => (result.type === "return" && result.value !== undefined ? [result.value.program.descriptor.id] : [])),
        ),
      ].toSorted();
      expect(descriptors).toEqual(["packages/ui/tsconfig.json", "tsconfig.json"]);
      console.info(JSON.stringify({ nativeTokenDelivery: { durationMs: performance.now() - started, maxRSSKiB: resourceUsage().maxRSS, descriptors } }));
      for (const [path, text] of before) {
        expect(readFileSync(join(repoRoot, path), "utf8"), path).toBe(text);
      }
    } finally {
      registered.mockRestore();
      generated.mockRestore();
    }
  },
  scaledBudget(60_000),
);

// A selected-files policy that owns a JSON resource, so the plan must schedule it without demanding token generation.
const resourceOwner = policy("json-resource-owner", { analysis: "resource", population: ["@product", "@tooling"], resources: [{ kind: "json", id: "biome" }] });

test("mixed resource-owner expansion cannot demand token generation for a skipped alias owner", async ({ repoRoot }) => {
  const manifest = JSON_RESOURCE_PATHS.biome;
  const unrelated = "packages/server/src/domain/x/read.ts";
  const paths = [unrelated, ...TOKEN_GENERATED_TYPE_PATHS];
  const program = { id: "tsconfig.json", config: "tsconfig.json", files: paths, references: [], configPaths: ["tsconfig.json"] };
  const policies = [aliases, resourceOwner];
  for (const { selected, aliasMode, resourceSources, scopedRequested, status, demands } of [
    {
      selected: manifest,
      aliasMode: "skipped",
      resourceSources: paths,
      scopedRequested: [unrelated, "tests/legacy/ui/probe.test.ts"],
      status: undefined,
      demands: 0,
    },
    {
      selected: TOKEN_GENERATED_TYPE_PATHS[0],
      aliasMode: "run",
      resourceSources: [TOKEN_GENERATED_TYPE_PATHS[0]],
      scopedRequested: [TOKEN_GENERATED_TYPE_PATHS[0]],
      status: "unresolved",
      demands: 1,
    },
  ] as const) {
    const semantic = { path: selected, status: "present" as const, previousPath: null };
    const planned = planPolicyCommand({
      request: {
        mode: "run",
        tier: "changed",
        scope: { kind: "file", paths: [selected] },
        selector: { kind: "all" },
        strictScope: false,
        failOnWarnings: false,
        json: true,
      },
      corpus: { gates: policies, families: [aliases.family, resourceOwner.family] },
      resourceOptions: { root: repoRoot },
      executionWorkspacePaths: paths,
      scope: {
        request: { kind: "file", paths: [selected] },
        kind: "file",
        label: "bounded generated demand",
        requestedPaths: [semantic],
        currentPaths: [selected],
        semanticPaths: [semantic],
        programs: [program],
        requestedProgramIds: [program.id],
        ownership: [],
        workspacePackage: null,
        projectConfig: null,
        inventory: {
          source: "git",
          trackedCommand: ["git", "ls-files", "-z"],
          untrackedCommand: ["git", "ls-files", "--others", "-z"],
          trackedCount: 4,
          untrackedCount: 0,
          authoredCount: 4,
          mergeBase: null,
        },
      },
    });
    if (!planned.ok || planned.plan.mode !== "run") {
      throw new Error(JSON.stringify(planned));
    }
    const alias = planned.plan.policies.find(({ policyId }) => policyId === aliases.id);
    expect(alias?.mode).toBe(aliasMode);
    expect(planned.plan.policies.find(({ policyId }) => policyId === resourceOwner.id)).toMatchObject({
      mode: "run",
      population: { effectiveSourcePaths: resourceSources },
    });
    let nativeDemands = 0;
    const prepared = await prepareTokenTypeGeneration(
      {
        root: repoRoot,
        project: new Project({ useInMemoryFileSystem: true }),
        files: [],
        nativeSourceView: () => {
          nativeDemands += 1;
        },
      },
      alias,
    );
    expect(nativeDemands).toBe(demands);
    expect(prepared?.status).toBe(status);
    nativeDemands = 0;
    const syntax = new Project({ useInMemoryFileSystem: true });
    for (const path of paths) {
      syntax.createSourceFile(join(repoRoot, path), "export const value=1;");
    }
    const scoped = tokenTypeGenerationOwner({
      root: repoRoot,
      project: syntax,
      policies,
      knownPolicies: policies,
      requestedPaths: scopedRequested,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    const scopedPrepared = await prepareTokenTypeGeneration(
      {
        root: repoRoot,
        project: syntax,
        files: [],
        nativeSourceView: () => {
          nativeDemands += 1;
        },
      },
      scoped,
    );
    expect(scopedPrepared?.status).toBe(status);
    expect(nativeDemands).toBe(demands);
  }
});
