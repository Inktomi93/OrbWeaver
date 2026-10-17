// Native child commands execute; in-process verdicts borrow pinned historical SQLite observations.
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { afterEach, beforeEach, vi } from "vitest";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as parity } from "../../../../tooling/src/verify/gates/zod-output-twin-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { typeObservationPlan, typeObservationReaders } from "../../../../tooling/src/verify/lib/type-observation-context.ts";
import { readExpressionZodOutputTwinWith } from "../../../../tooling/src/verify/lib/zod-output-twin.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { nativeInventoryFixture } from "../../floor/compiler/native-inventory-fixture.ts";
import { nativeVerifyFixture } from "../../floor/compiler/native-verify-fixture.ts";

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
    put(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(new URL(`../../../../tooling/src/verify/gates/${id}.ts`, import.meta.url).href)};`,
    );
  }
  execFixtureGit(root, ["init", "-q"]);
}

function historicalOutputTwin(context: ReturnType<typeof projectCtx>, source: SourceFile): ReturnType<typeof readExpressionZodOutputTwinWith> {
  const initial = source.getVariableDeclarationOrThrow("owned").getInitializerOrThrow();
  const plan = typeObservationPlan([source], [initial]);
  using facts = context.nativeTypeFacts?.();
  if (facts === undefined) {
    throw new Error("actual native type observation session is missing");
  }
  facts.request(parity.id, { kind: "invocation-evidence", nodes: [source], plan });
  facts.seal(new Set([parity.id]));
  const reader = typeObservationReaders(facts.invocationEvidence(parity.id, [source], plan)).get(source);
  if (reader === undefined) {
    throw new Error("captured native Zod observation reader is missing");
  }
  return readExpressionZodOutputTwinWith(initial, reader);
}

beforeEach(async () => {
  const inventoryFactory = await import("../../../../tooling/src/floor/code-facts/semantic-inventory.ts");
  vi.spyOn(inventoryFactory, "createSemanticInventory").mockImplementation(nativeInventoryFixture);
});
afterEach(() => vi.restoreAllMocks());

test(
  "native Zod structure and scoped commands retain conditional-world output parity without syntax semantics",
  async ({ scratch, repoRoot }) => {
    for (const browser of [false, true]) {
      const root = join(scratch, browser ? "browser" : "node");
      fixture(root, repoRoot, browser);
      const context = projectCtx(root);
      const source = context.project.getSourceFileOrThrow(join(root, entryPath(browser)));
      const baseline = historicalOutputTwin(context, source);
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
      try {
        const syntaxReads: number[] = [];
        const workers: string[] = [];
        const observation = { forbidSyntax: true, syntaxReads, workers };
        expect.soft(await nativeVerifyFixture(root, "structure", ["--check=zod-output-twin-parity"], observation)).toBe(browser ? 1 : 0);
        expect.soft(await nativeVerifyFixture(root, "scoped", ["--scope", "packages/**"], observation)).toBe(browser ? 1 : 0);
        expect(syntaxReads).toEqual([0, 0]);
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
        symbols.mockRestore();
        types.mockRestore();
      }
    }
  },
  scaledBudget(120_000),
);

test(
  "historical native crossworld aliases share a physical denominator but every importing-world authored twin is judged",
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
