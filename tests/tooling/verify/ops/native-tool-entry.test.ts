import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import { Node } from "ts-morph";
import ts from "typescript";
import tseslint from "typescript-eslint";
import { vi } from "vitest";
import {
  TYPED_NATIVE_COMPILER_CONTEXT_ENV,
  TYPED_NATIVE_POLICIES,
  typedNativeDependencyInputs,
  typedNativeDependencySignal,
  typedNativeMetadataSelection,
} from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";
import { readEslintFileAdmissions } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { scaledBudget } from "../../_load-budget.ts";
import { NATIVE_TOOL_ENTRY_PROOFS } from "./_fixtures/native-tool-entry-proofs.ts";

async function lintEntry(
  [eslint, repoRoot, root]: readonly [ESLint, string, string],
  rule: string,
  files: Readonly<Record<string, string>>,
  configs: readonly string[] | null = ["tsconfig.json"],
): Promise<readonly Linter.LintMessage[]> {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  const configPath = join(root, "tsconfig.json");
  writeFileSync(configPath, JSON.stringify({ compilerOptions: { noLib: true }, files: Object.keys(files) }));
  const program = ts.createProgram(
    Object.keys(files).map((path) => join(root, path)),
    {
      noLib: true,
      types: [],
      strict: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      configFilePath: configPath,
    },
  );
  vi.stubEnv(TYPED_NATIVE_COMPILER_CONTEXT_ENV, JSON.stringify({ root, configs }));
  const project = vi.spyOn(Node.prototype, "getProject").mockImplementation(() => {
    throw new Error("native entry acquired another Project");
  });
  const messages: Linter.LintMessage[] = [];
  try {
    for (const [path, source] of Object.entries(files)) {
      const config = await eslint.calculateConfigForFile(join(repoRoot, path));
      if (config.rules?.[rule] === undefined) {
        continue;
      }
      messages.push(
        ...new Linter({ cwd: root }).verify(
          source,
          {
            files: ["**/*.ts"],
            plugins: config.plugins,
            languageOptions: { parser: tseslint.parser, parserOptions: { programs: [program], projectService: false } },
            linterOptions: { noInlineConfig: true },
            rules: { [rule]: "error" },
          },
          { filename: join(root, path) },
        ),
      );
    }
    expect(project).not.toHaveBeenCalled();
    return messages;
  } finally {
    project.mockRestore();
    vi.unstubAllEnvs();
  }
}

const hardEslint = (repoRoot: string): readonly [ESLint, string] => [
  new ESLint({ cwd: repoRoot, overrideConfigFile: join(repoRoot, "eslint-hard.config.js") }),
  repoRoot,
];

test("native HARD tool entries preserve every founding verdict without another Project", { timeout: scaledBudget(30_000) }, async ({ scratch, repoRoot }) => {
  const eslint = hardEslint(repoRoot);
  let sequence = 0;
  for (const policy of NATIVE_TOOL_ENTRY_PROOFS) {
    for (const [flag, proofs] of [
      [true, policy.mustFlag],
      [false, policy.mustPass],
    ] as const) {
      for (const proof of proofs) {
        const messages = await lintEntry([...eslint, join(scratch, String(sequence++))], `orb/${policy.id}`, proof.files);
        expect(messages, `${policy.id}: ${proof.why}`).toHaveLength(flag ? (proof.expect?.count ?? 1) : 0);
      }
    }
  }
});

const RUNNER = "tooling/src/floor/cli/run-tool.ts";
const GUARD = "tooling/src/floor/cli/entrypoint.ts";
const CLI = "tooling/src/demo/cli.ts";
const OPS = "tooling/src/demo/ops/entry.ts";
const HOMES = {
  [RUNNER]: "export function runTool(main:()=>number):void{void main;}\n",
  [GUARD]: "export function refuseDirectInvocation():void{}\n",
};

test("native HARD entry refuses absent or renamed homes and absent or mismatched compiler context", async ({ scratch, repoRoot }) => {
  const eslint = hardEslint(repoRoot);
  let sequence = 0;
  for (const [home, exported] of [
    [RUNNER, "runTool"],
    [GUARD, "refuseDirectInvocation"],
  ] as const) {
    for (const renamed of [false, true]) {
      const files: Record<string, string> = { ...HOMES, [OPS]: "export const value=1;" };
      if (renamed) {
        files[home] = HOMES[home].replace(exported, "renamed");
      } else {
        delete files[home];
      }
      await expect(lintEntry([...eslint, join(scratch, String(sequence++))], "orb/tooling-ops-direct-invocation", files)).rejects.toThrow(
        "home/export unavailable",
      );
    }
  }
  for (const renamed of [false, true]) {
    const files: Record<string, string> = { ...HOMES, [CLI]: "export const value=1;" };
    if (renamed) {
      files[RUNNER] = HOMES[RUNNER].replace("runTool", "renamed");
    } else {
      delete files[RUNNER];
    }
    await expect(lintEntry([...eslint, join(scratch, String(sequence++))], "orb/tooling-cli-entry", files)).rejects.toThrow("home/export unavailable");
  }
  for (const configs of [null, ["tsconfig.other.json"]]) {
    await expect(
      lintEntry([...eslint, join(scratch, String(sequence++))], "orb/tooling-cli-entry", { ...HOMES, [CLI]: "export const value=1;" }, configs),
    ).rejects.toThrow(configs === null ? "admitted native compiler context" : "does not match");
  }
});

test("native entry distinguishes actual module scope, aliases, computed namespaces and a local fake runner", async ({ scratch, repoRoot }) => {
  const eslint = hardEslint(repoRoot);
  const rule = "orb/tooling-ops-direct-invocation";
  const cases = [
    ['import {runTool as run} from "../../floor/cli/run-tool.ts"; run(()=>0);', 0],
    ['import {runTool} from "../../floor/cli/run-tool.ts"; async function boot(){await runTool(()=>0);} await boot();', 1],
    ["function runTool(main:()=>number){void main;} runTool(()=>0);", 1],
    ['import * as runner from "../../floor/cli/run-tool.ts"; runner["runTool"](()=>0);', 0],
    ['import * as runner from "../../floor/cli/run-tool.ts"; const key="runTool"; runner[key](()=>0);', 0],
    ['import * as runner from "../../floor/cli/run-tool.ts"; declare const key:string; runner[key](()=>0);', 1],
    ['const runner=await import("../../floor/cli/run-tool.ts"); runner.runTool(()=>0);', 0],
    ["declare const door:string; const runner=await import(door); runner.runTool(()=>0);", 1],
    ['import * as runner from "../../floor/cli/run-tool.ts"; const {runTool:run}=runner; run(()=>0);', 0],
    ['import {runTool} from "../../floor/cli/run-tool.ts"; function boot(runTool:()=>void){runTool();} boot(()=>{});', 1],
  ] as const;
  for (const [index, [source, count]] of cases.entries()) {
    expect(await lintEntry([...eslint, join(scratch, String(index))], rule, { ...HOMES, [OPS]: source }), source).toHaveLength(count);
  }
});

test("private native metadata watches authored manifest additions and deletions without workspace discovery", ({ scratch }) => {
  const entry = TYPED_NATIVE_POLICIES.find(({ id }) => id === "tooling-cli-entry");
  if (entry === undefined) {
    throw new Error("tool entry metadata missing");
  }
  const authored = ["package.json", "standalone/plugin/package.json", "tooling/src/demo/cli.ts"];
  const inputs = typedNativeDependencyInputs(entry, authored, scratch);
  expect(inputs.paths).toContain("standalone/plugin/package.json");
  expect(inputs.paths).toContain("package.json");
  expect(inputs.roots).toContain("tooling/src/");
  for (const path of ["standalone/new/package.json", "standalone/deleted/package.json", "tooling/src/provider.ts"]) {
    expect(typedNativeDependencySignal(entry, [path], authored, scratch)).toBe(true);
    expect(
      typedNativeMetadataSelection(
        { hard: true, requiresTypeInformation: true, patterns: ["."], rules: [entry.ruleId], label: entry.id },
        entry,
        { paths: [path], direct: false },
        inputs,
      ),
    ).toHaveLength(1);
  }
  expect(() => typedNativeDependencyInputs(entry, authored)).toThrow("native process-private dependency owner is missing");
  expect(() => typedNativeDependencyInputs(entry, authored, join(scratch, "missing-root"))).toThrow();
});

test("the complete HARD configuration preserves native tooling ownership after syntax parser layers", async ({ repoRoot }) => {
  expect(await readEslintFileAdmissions(repoRoot, "eslint-hard.config.js", ["tooling/src/verify/ops/eslint.ts"])).toMatchObject([
    { requiresTypeInformation: true, compilerConfigs: ["tooling/tsconfig.json"], hasEnabledRules: true },
  ]);
});
