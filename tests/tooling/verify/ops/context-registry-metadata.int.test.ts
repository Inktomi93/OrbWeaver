// Context vocabulary changes must reach native client rejudgment through the existing lint command.
// @subject tooling/src/verify/lib/context-definition-shape.ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runScopedEslint } from "@orb/tooling/verify";
import tseslint from "typescript-eslint";
import { CONTEXT_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/lib/context-definition-shape.ts";

const VOCABULARY = CONTEXT_NATIVE_INPUT_PATHS[1];
const SOURCE = "packages/client/src/features/probe/lib/probe.tsx";
const BAD = 'export const x={kind:"tabs",useResolved:()=>null};';
const GOOD = 'export const x={kind:"single",body:()=>null};';

function nativeRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  // Only the controlled helper is untyped in this fixture; production keeps its ordinary typed rules.
  const untypedRules = JSON.stringify(tseslint.configs.disableTypeChecked.rules);
  const entries = JSON.stringify(["ordinary.js", VOCABULARY]);
  return plantedTree({
    ...Object.fromEntries(CONTEXT_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": `import config from ${config};export default [...config,{files:${entries},languageOptions:{parserOptions:{project:false,projectService:false,programs:null}},rules:{...${untypedRules},"no-alert":"error"}}];`,
    "eslint-hard.config.js": `export {hardConfig as default} from ${config};`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [SOURCE]: source,
    "ordinary.js": "export const legal=1;\n",
  });
}

function metadataSelection(): Selection {
  return {
    kind: "changed",
    label: "deleted context vocabulary",
    paths: [VOCABULARY],
    existingPaths: [],
    runtimeSubjects: [],
    eslintPaths: [],
    depcruisePaths: [],
    docsPaths: [],
    tsconfigs: [],
    ct: { mode: "skip", targets: [] },
    checkScopeArgv: ["node", "tooling/src/verify/cli.ts", "scoped"],
    gitRef: undefined,
  };
}

test("the registry carries deleted context vocabulary without ordinary sources", () => {
  const row = REGISTRY.find(({ name }) => name === "lint:eslint");
  expect(row?.scopedArgv?.(metadataSelection())).toEqual(["node", "tooling/src/verify/cli.ts", "eslint-scoped", VOCABULARY]);
});

test("a sharedleaf edit rejudges actual client syntax instead of linting only the helper", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, BAD);
  writeFileSync(join(root, VOCABULARY), readFileSync(join(root, VOCABULARY), "utf8") + "\n// Edited vocabulary input.\n");
  expect(await runScopedEslint(root, [VOCABULARY])).toBe(1);
});

test("a sharedleaf-only request with legal client source is clean", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, GOOD);
  expect(await runScopedEslint(root, [VOCABULARY])).toBe(0);
});

for (const allowed of [false, true]) {
  test(`mixed context metadata keeps ordinary source rules: ${allowed ? "legal" : "blocked"}`, async ({ plantedTree, repoRoot }) => {
    const root = await nativeRoot(plantedTree, repoRoot, GOOD);
    writeFileSync(join(root, "ordinary.js"), allowed ? "export const legal=1;\n" : "alert('blocked');\n");
    expect(await runScopedEslint(root, [VOCABULARY, "ordinary.js"])).toBe(allowed ? 0 : 1);
  });
}

test("deleted context vocabulary is a real CLI tool error, not skipped input", async ({ plantedTree, repoRoot, runCli }) => {
  const root = await nativeRoot(plantedTree, repoRoot, GOOD);
  unlinkSync(join(root, VOCABULARY));
  await expect(await runCli("verify", ["eslint-scoped", VOCABULARY], { cwd: root })).toExitWith(2);
});

test("zero native client sources refuses rather than certifying the helper alone", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, GOOD);
  unlinkSync(join(root, SOURCE));
  await expect(runScopedEslint(root, [VOCABULARY])).rejects.toThrow();
});
