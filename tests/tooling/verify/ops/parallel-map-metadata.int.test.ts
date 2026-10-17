// Canonical vocabulary changes reach the native map wall through the existing lint command.
// @subject tooling/src/verify/lib/client-map-native.ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runScopedEslint } from "@orb/tooling/verify";
import tseslint from "typescript-eslint";
import { CLIENT_MAP_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/lib/client-map-native.ts";

const VOCABULARY = "packages/client/src/state/section-ids.ts";
const HOME_HELPER = "tooling/src/verify/lib/registry-definition-home.ts";
const SOURCE = "packages/client/src/features/probe/lib/probe.tsx";

function nativeRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const untyped = JSON.stringify(tseslint.configs.disableTypeChecked.rules);
  return plantedTree({
    ...Object.fromEntries(CLIENT_MAP_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": `import config from ${config};export default [...config,{files:["ordinary.js",...${JSON.stringify(CLIENT_MAP_NATIVE_INPUT_PATHS)}],languageOptions:{parserOptions:{project:false,projectService:false,programs:null}},rules:{...${untyped},"no-alert":"error"}}];`,
    "eslint-hard.config.js": `export {hardConfig as default} from ${config};`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [SOURCE]: source,
    "ordinary.js": "export const legal=1;\n",
  });
}

test("registry retains deleted canonical map input even with no ordinary source", () => {
  const selection: Selection = {
    kind: "changed",
    label: "deleted map input",
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
  expect(REGISTRY.find(({ name }) => name === "lint:eslint")?.scopedArgv?.(selection)).toEqual([
    "node",
    "tooling/src/verify/cli.ts",
    "eslint-scoped",
    VOCABULARY,
  ]);
});

test("home-helper-only changes rejudge actual client map subjects", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M={chats:1,characters:2};");
  expect(await runScopedEslint(root, [HOME_HELPER])).toBe(1);
});

test("canonical vocabulary-only selection keeps a legal derived client list clean", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
  expect(await runScopedEslint(root, [VOCABULARY])).toBe(0);
});

for (const allowed of [false, true]) {
  test(`map metadata mixed source retains ordinary lint: ${allowed ? "legal" : "blocked"}`, async ({ plantedTree, repoRoot }) => {
    const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
    writeFileSync(join(root, "ordinary.js"), allowed ? "export const legal=1;\n" : "alert('blocked');\n");
    expect(await runScopedEslint(root, [HOME_HELPER, "ordinary.js"])).toBe(allowed ? 0 : 1);
  });
}

test("missing canonical map input refuses at the actual CLI instead of skipping", async ({ plantedTree, repoRoot, runCli }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
  unlinkSync(join(root, VOCABULARY));
  await expect(await runCli("verify", ["eslint-scoped", VOCABULARY], { cwd: root })).toExitWith(2);
});

test("missing map dependency refuses even when the vocabulary itself exists", async ({ plantedTree, repoRoot, runCli }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
  unlinkSync(join(root, HOME_HELPER));
  await expect(await runCli("verify", ["eslint-scoped", HOME_HELPER], { cwd: root })).toExitWith(2);
});
