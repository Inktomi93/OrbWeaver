import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { SyntaxKind } from "ts-morph";
import { vi } from "vitest";
import { createSemanticInventory } from "../../../../tooling/src/floor/code-facts/semantic-inventory.ts";
import { readCompilerPrograms } from "../../../../tooling/src/floor/compiler/compiler-programs.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/firehose-import-allowlist-health.ts";
import { gate as verbs } from "../../../../tooling/src/verify/gates/verb-naming.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { runScopedCli } from "../../../../tooling/src/verify/ops/scoped.ts";
import { runStructure } from "../../../../tooling/src/verify/ops/structure.ts";
import { scaledBudget } from "../../_load-budget.ts";

const VERB = "packages/server/src/domain/chat/verbs/start-chat.ts";
const FIREHOSE = "packages/server/src/transport/trpc/chat-events-bus.ts";
const POLICIES = ["verb-naming", "firehose-import-allowlist-health"] as const;

function fixture(root: string, repoRoot: string, browser: boolean): void {
  const write = (path: string, text: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  write(".gitignore", "node_modules\n.cache\nreports\n");
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  const compilerOptions = {
    target: "ES2022",
    module: "ESNext",
    moduleResolution: "Bundler",
    strict: true,
    skipLibCheck: true,
    lib: browser ? ["es2022", "dom"] : ["es2022"],
    types: browser ? [] : ["node"],
  };
  write("tsconfig.json", JSON.stringify({ compilerOptions, files: [VERB, FIREHOSE, "packages/server/src/platform.ts"] }));
  write("tooling/tsconfig.json", JSON.stringify({ compilerOptions, files: POLICIES.map((id) => `src/verify/gates/${id}.ts`) }));
  for (const id of POLICIES) {
    write(
      `tooling/src/verify/gates/${id}.ts`,
      `export {gate} from ${JSON.stringify(pathToFileURL(join(repoRoot, `tooling/src/verify/gates/${id}.ts`)).href)};`,
    );
  }
  write("packages/server/src/platform.ts", "export declare const operation: ReturnType<typeof setTimeout> extends number ? number : (()=>void);");
  write(VERB, "import {operation} from '../../../platform'; export const createStartChat=operation;");
  write(FIREHOSE, "import {operation} from '../../platform'; export const subscribeAllChatEvents=operation;");
  execFixtureGit(root, ["init", "-q"]);
}

test(
  "both command doors interpret imported callable exports in the native Node and browser world",
  async ({ scratch, repoRoot }) => {
    const exits: number[] = [];
    for (const browser of [false, true]) {
      const root = join(scratch, browser ? "browser" : "node");
      fixture(root, repoRoot, browser);
      for (const id of POLICIES) {
        exits.push(await runStructure(root, [`--check=${id}`]));
      }
      exits.push(await runScopedCli(root, ["--scope", "packages/server/src"]));
    }
    expect(exits).toEqual([0, 0, 0, 1, 1, 1]);
  },
  scaledBudget(60_000),
);

test(
  "both consumers share closed demand in either order and never acquire the syntax checker",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    const context = projectCtx(scratch);
    const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
    const worker = vi.spyOn(workers, "runInventoryPartitionWorker");
    const checker = vi.spyOn(context.project, "getTypeChecker").mockImplementation(() => {
      throw new Error("syntax checker fallback");
    });
    try {
      for (const policies of [
        [verbs, health],
        [health, verbs],
      ]) {
        const pass = runPolicyPass({
          root: scratch,
          project: context.project,
          ...nativeTypeFactOptions(context),
          knownPolicies: policies,
          policies,
          reviewedGrants: [],
          failOnWarnings: false,
        });
        expect(pass.toolErrors).toEqual([]);
        expect(pass.policies.map(({ owner, findings }) => [owner.status, findings.length])).toEqual([
          ["success", 0],
          ["success", 0],
        ]);
      }
      expect(checker).not.toHaveBeenCalled();
      expect(worker.mock.calls.map(([request]) => [request.descriptor.id, request.families])).toEqual([["tsconfig.json", ["runtime-exports"]]]);
    } finally {
      worker.mockRestore();
      checker.mockRestore();
    }
  },
  scaledBudget(60_000),
);

test(
  "declaration callability and initializer callability remain different consumer judgments",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    writeFileSync(join(scratch, VERB), "export const createStartChat:()=>void = (1 as never);");
    writeFileSync(join(scratch, FIREHOSE), "export const subscribeAllChatEvents:()=>void = (1 as never);");
    expect(await runStructure(scratch, ["--check=verb-naming"])).toBe(1);
    expect(await runStructure(scratch, ["--check=firehose-import-allowlist-health"])).toBe(0);
  },
  scaledBudget(60_000),
);

test("missing services and failed native workers withhold both consumers through both doors", async ({ scratch, repoRoot }) => {
  fixture(scratch, repoRoot, false);
  const contexts = await import("../../../../tooling/src/verify/lib/project-context.ts");
  const original = contexts.projectCtx;
  const context = vi.spyOn(contexts, "projectCtx").mockImplementation((root) => {
    const { nativeTypeFacts: omitted, ...rest } = original(root);
    expect(omitted).toBeDefined();
    return rest;
  });
  try {
    for (const id of POLICIES) {
      expect(await runStructure(scratch, [`--check=${id}`])).toBe(2);
    }
    expect(await runScopedCli(scratch, ["--scope", "packages/server/src"])).toBe(2);
  } finally {
    context.mockRestore();
  }
  const workers = await import("../../../../tooling/src/floor/compiler/semantic-inventory-worker-run.ts");
  const worker = vi.spyOn(workers, "runInventoryPartitionWorker").mockImplementation(() => {
    throw new Error("native runtime export worker failed");
  });
  try {
    for (const id of POLICIES) {
      expect(await runStructure(scratch, [`--check=${id}`])).toBe(2);
    }
    expect(await runScopedCli(scratch, ["--scope", "packages/server/src"])).toBe(2);
    expect(worker).toHaveBeenCalledTimes(3);
  } finally {
    worker.mockRestore();
  }
});

test(
  "native runtime exports refuse missing families, foreign worlds, stale and disposed sources",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    const descriptor = readCompilerPrograms(scratch).find(({ id }) => id === "tsconfig.json");
    if (descriptor === undefined) {
      throw new Error("missing fixture compiler owner");
    }
    using inventory = createSemanticInventory({ root: scratch, programs: [descriptor], families: ["runtime-exports"] });
    const source = inventory.sourceCorpus().getSourceFile(VERB);
    if (source === undefined) {
      throw new Error("missing exporting source");
    }
    expect(inventory.runtimeExports(source, descriptor.id)).toMatchObject([
      { name: "createStartChat", callable: true, initializer: { kind: SyntaxKind.Identifier, callable: true } },
    ]);
    expect(() => inventory.runtimeExports(source, "foreign")).toThrow("partition is unavailable");
    expect(() => inventory.exports(source)).toThrow("family unavailable: exports");
    using brands = createSemanticInventory({ root: scratch, programs: [descriptor], families: ["id-brands"] });
    expect(() => brands.runtimeExports(source, descriptor.id)).toThrow("family unavailable: runtime-exports");
    source.replaceWithText("export const createStartChat=0;");
    expect(() => inventory.runtimeExports(source, descriptor.id)).toThrow("source/epoch");
    inventory[Symbol.dispose]();
    expect(() => inventory.runtimeExports(source, descriptor.id)).toThrow("disposed");
  },
  scaledBudget(60_000),
);

test(
  "one generation keeps different native interpretations and refuses ambiguous verifier ownership",
  ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    writeFileSync(
      join(scratch, "tsconfig.tests-dom.json"),
      JSON.stringify({
        compilerOptions: {
          strict: true,
          skipLibCheck: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          lib: ["es2022", "dom"],
          types: [],
        },
        files: [VERB, FIREHOSE, "packages/server/src/platform.ts"],
      }),
    );
    const programs = readCompilerPrograms(scratch).filter(({ id }) => id === "tsconfig.json" || id === "tsconfig.tests-dom.json");
    expect(programs.map(({ id }) => id).toSorted()).toEqual(["tsconfig.json", "tsconfig.tests-dom.json"]);
    using inventory = createSemanticInventory({ root: scratch, programs, families: ["runtime-exports"] });
    const source = inventory.sourceCorpus().getSourceFile(VERB);
    if (source === undefined) {
      throw new Error("missing shared exporting source");
    }
    const node = inventory.runtimeExports(source, "tsconfig.json");
    const browser = inventory.runtimeExports(source, "tsconfig.tests-dom.json");
    expect(node.map(({ declaration }) => declaration)).toEqual(browser.map(({ declaration }) => declaration));
    expect(node.map(({ callable }) => callable)).toEqual([true]);
    expect(browser.map(({ callable }) => callable)).toEqual([false]);
    const context = projectCtx(scratch);
    const policies = [verbs, health];
    const pass = runPolicyPass({
      root: scratch,
      project: context.project,
      ...nativeTypeFactOptions(context),
      knownPolicies: policies,
      policies,
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(pass.toolErrors.some(({ message }) => message.includes("unambiguous primary compiler owner"))).toBe(true);
    expect(pass.policies.every(({ owner, findings }) => owner.status !== "success" && findings.length === 0)).toBe(true);
  },
  scaledBudget(60_000),
);

test(
  "native re-export origins preserve each consumer's distinct home judgment",
  async ({ scratch, repoRoot }) => {
    fixture(scratch, repoRoot, false);
    writeFileSync(join(scratch, "packages/server/src/platform.ts"), "export function operation():void{}");
    writeFileSync(join(scratch, VERB), "export {operation as createStartChat} from '../../../platform';");
    writeFileSync(join(scratch, FIREHOSE), "export {operation as subscribeAllChatEvents} from '../../platform';");
    expect(await runStructure(scratch, ["--check=verb-naming"])).toBe(0);
    expect(await runStructure(scratch, ["--check=firehose-import-allowlist-health"])).toBe(1);
  },
  scaledBudget(60_000),
);
