// Native command controls separate importing-world Zod meaning from ordinary syntax nomination.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node } from "ts-morph";
import { vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as parity } from "../../../../tooling/src/verify/gates/zod-output-twin-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { readExpressionZodOutputTwin } from "../../../../tooling/src/verify/lib/zod-output-twin.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const COMPILER_OPTIONS = { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", strict: true, skipLibCheck: true, types: [] };
const POLICIES = [parity];
const entryPath = (browser: boolean): string => `packages/${browser ? "client" : "server"}/src/schema.ts`;
function fixture(root: string, repoRoot: string, browser: boolean): void {
  const put = (path: string, source: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  };
  put(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const entry = entryPath(browser);
  const files = {
    [entry]:
      'import * as z from "zod";import type {Expected} from "#expected";export const owned=z.object({mode:z.literal("node")}) satisfies z.ZodType<Expected>;',
    "packages/contracts/src/node.ts": 'export interface Expected {mode:"node"}',
    "packages/contracts/src/browser.ts": 'export interface Expected {mode:"browser"}',
  };
  for (const [path, text] of Object.entries(files)) {
    put(path, text);
  }
  const compilerOptions = {
    ...COMPILER_OPTIONS,
    lib: browser ? ["ES2022", "DOM"] : ["ES2022"],
    ...(browser ? { customConditions: ["browser"] } : {}),
  };
  put(
    "package.json",
    JSON.stringify({
      type: "module",
      imports: { "#expected": { browser: "./packages/contracts/src/browser.ts", default: "./packages/contracts/src/node.ts" } },
    }),
  );
  put("tsconfig.json", JSON.stringify({ compilerOptions, files: Object.keys(files) }));
  put(`packages/${browser ? "client" : "server"}/tsconfig.json`, JSON.stringify({ compilerOptions, files: ["src/schema.ts"] }));
  put("packages/contracts/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/node.ts", "src/browser.ts"] }));
  put("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map(({ id }) => `src/verify/gates/${id}.ts`) }));
  for (const { id } of POLICIES) {
    put(`tooling/src/verify/gates/${id}.ts`, `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`);
  }
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "native Zod structure and scoped commands retain conditional-world output parity without syntax semantics",
  async ({ scratch, repoRoot }) => {
    for (const browser of [false, true]) {
      const root = join(scratch, browser ? "browser" : "node");
      fixture(root, repoRoot, browser);
      const context = projectCtx(root);
      const native = context.nativeSourceView?.(join(root, entryPath(browser)));
      if (native === undefined) {
        throw new Error("actual native source view is missing");
      }
      const initial = native.sourceFile.getVariableDeclarationOrThrow("owned").getInitializerOrThrow();
      const baseline = readExpressionZodOutputTwin(initial);
      expect(baseline.kind).toBe("pair");
      if (baseline.kind !== "pair") {
        throw new Error("installed native Zod output pair is unavailable");
      }
      expect(baseline.outputToTarget).toBe(!browser);
      expect(baseline.targetToOutput).toBe(!browser);
      const getType = Node.prototype.getType;
      const getSymbol = Node.prototype.getSymbol;
      const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project) {
          throw new Error("ordinary syntax Zod Type read");
        }
        return getType.call(this);
      });
      const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
        if (this.getProject() === context.project) {
          throw new Error("ordinary syntax Zod Symbol read");
        }
        return getSymbol.call(this);
      });
      const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
      const useContext = vi.spyOn(contexts, "projectCtx").mockReturnValue(context);
      try {
        expect.soft(await runStructure(root, ["--check=zod-output-twin-parity"])).toBe(browser ? 1 : 0);
        expect.soft(await runScopedCli(root, ["--scope", "packages/**"])).toBe(browser ? 1 : 0);
        const result = runPolicyPass({
          root,
          project: context.project,
          ...nativeTypeFactOptions(context),
          knownPolicies: POLICIES,
          policies: POLICIES,
          reviewedGrants: [],
          failOnWarnings: false,
        });
        expect.soft(result.toolErrors).toEqual([]);
        expect.soft(result.policies.find(({ id }) => id === parity.id)?.findings).toHaveLength(browser ? 1 : 0);
      } finally {
        useContext.mockRestore();
        symbols.mockRestore();
        types.mockRestore();
      }
    }
  },
  scaledBudget(120_000),
);

test(
  "crossworld aliases share a physical denominator but every importing-world authored twin is judged",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    const compilerOptions = { ...COMPILER_OPTIONS, lib: ["ES2022"] };
    const put = (path: string, text: string): void => {
      mkdirSync(dirname(join(scratch, path)), { recursive: true });
      writeFileSync(join(scratch, path), text);
    };
    const shared = "packages/contracts/src/shared.ts";
    put(
      shared,
      'import * as z from "zod";import type{Expected}from"#expected";export const wire=z.object({mode:z.literal("node")}) satisfies z.ZodType<Expected>;',
    );
    put("packages/server/src/schema.ts", 'import {wire}from"../../contracts/src/shared";export const registry={alias:wire};');
    put("packages/client/src/schema.ts", 'import {wire}from"../../contracts/src/shared";export const registry={alias:wire};');
    put(
      "packages/client/tsconfig.json",
      JSON.stringify({ compilerOptions: { ...compilerOptions, customConditions: ["browser"], lib: ["ES2022", "DOM"] }, files: ["src/schema.ts"] }),
    );
    put("packages/contracts/tsconfig.json", JSON.stringify({ compilerOptions, files: ["src/node.ts", "src/browser.ts", "src/shared.ts"] }));
    const context = projectCtx(scratch);
    const getType = Node.prototype.getType;
    const getSymbol = Node.prototype.getSymbol;
    const types = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("ordinary alias Type read");
      }
      return getType.call(this);
    });
    const symbols = vi.spyOn(Node.prototype, "getSymbol").mockImplementation(function (this: Node) {
      if (this.getProject() === context.project) {
        throw new Error("ordinary alias Symbol read");
      }
      return getSymbol.call(this);
    });
    try {
      const result = runPolicyPass({
        root: scratch,
        project: context.project,
        ...nativeTypeFactOptions(context),
        knownPolicies: POLICIES,
        policies: POLICIES,
        reviewedGrants: [],
        failOnWarnings: false,
      });
      expect(result.toolErrors).toEqual([]);
      expect(result.policies.find(({ id }) => id === parity.id)?.receipts).toMatchObject([{ members: 1, unresolved: 0 }]);
      expect(result.policies.find(({ id }) => id === parity.id)?.findings).toMatchObject([
        { file: shared, message: expect.stringContaining("authored type is not assignable") },
      ]);
    } finally {
      symbols.mockRestore();
      types.mockRestore();
    }
  },
  scaledBudget(120_000),
);
