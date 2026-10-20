// Canonical vocabulary changes reach the native map wall through the existing lint command.
// @subject tooling/src/verify/lib/client-map-native.ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runScopedEslint } from "@orb/tooling/verify";
import tseslint from "typescript-eslint";
import { TYPE_HOME_NATIVE_POLICY_ID } from "../../../../tooling/src/floor/code-facts/type-home.ts";
import { CLIENT_MAP_NATIVE_INPUT_PATHS, CLIENT_MAP_NATIVE_RULE } from "../../../../tooling/src/verify/lib/client-map-native.ts";
import { TYPED_NATIVE_POLICIES } from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";
import { scaledBudget } from "../../_load-budget.ts";

const VOCABULARY = "packages/client/src/state/section-ids.ts";
const HOME_HELPER = "tooling/src/verify/lib/registry-definition-home.ts";
const SOURCE = "packages/client/src/features/probe/lib/probe.tsx";

async function nativeRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const untyped = JSON.stringify(tseslint.configs.disableTypeChecked.rules);
  const declaration = TYPED_NATIVE_POLICIES.find(({ id }) => id === TYPE_HOME_NATIVE_POLICY_ID);
  if (declaration === undefined) {
    throw new Error("native helper declaration metadata is missing");
  }
  const rules = JSON.stringify([CLIENT_MAP_NATIVE_RULE, declaration.ruleId]);
  const root = await plantedTree({
    ".gitignore": "node_modules\n.cache\nreports\n",
    ...Object.fromEntries(declaration.inputs.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    ...Object.fromEntries(CLIENT_MAP_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"name":"native-metadata-fixture","type":"module","private":true}',
    "pnpm-workspace.yaml": "packages:\n  - packages/*\n",
    "packages/server/package.json": '{"name":"@orb/server","type":"module","private":true}',
    "tooling/tsconfig.json": JSON.stringify({
      compilerOptions: { noLib: true, types: [], module: "ESNext", moduleResolution: "Bundler" },
      files: ["src/verify/lib/registry-definition-home.ts"],
    }),
    // Metadata stays data; the real D331 rule judges only the named helper through its native owner.
    "eslint.config.js": `import config,{hardConfig} from ${config};const select=rows=>rows.map(row=>({...row,rules:Object.fromEntries(Object.entries(row.rules??{}).filter(([rule])=>${rules}.includes(rule)))}));export const hard=select(hardConfig);export default [...select(config),{ignores:${JSON.stringify(declaration.inputs.filter((path) => path !== HOME_HELPER))}},{files:["ordinary.js",...${JSON.stringify(CLIENT_MAP_NATIVE_INPUT_PATHS)}],languageOptions:{parserOptions:{project:false,projectService:false,programs:null}},rules:{...${untyped},"no-alert":"error"}},{files:[${JSON.stringify(HOME_HELPER)}],languageOptions:{parserOptions:{project:["tooling/tsconfig.json"],projectService:false,programs:null,tsconfigRootDir:import.meta.dirname}}}];`,
    "eslint-hard.config.js": 'export {hard as default} from "./eslint.config.js";',
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [SOURCE]: source,
    "ordinary.js": "export const legal=1;\n",
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
  return root;
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

test("home-helper-only changes rejudge actual client map subjects", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M={chats:1,characters:2};");
  expect(await runScopedEslint(root, [HOME_HELPER])).toBe(1);
});

test("canonical vocabulary-only selection keeps a legal derived client list clean", { timeout: scaledBudget(30_000) }, async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
  expect(await runScopedEslint(root, [VOCABULARY])).toBe(0);
});

for (const allowed of [false, true]) {
  test(`map metadata mixed source retains ordinary lint: ${allowed ? "legal" : "blocked"}`, { timeout: scaledBudget(30_000) }, async ({
    plantedTree,
    repoRoot,
  }) => {
    const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
    writeFileSync(join(root, "ordinary.js"), allowed ? "export const legal=1;\n" : "alert('blocked');\n");
    expect(await runScopedEslint(root, [HOME_HELPER, "ordinary.js"])).toBe(allowed ? 0 : 1);
  });
}

test("missing canonical map input refuses at the actual CLI instead of skipping", { timeout: scaledBudget(30_000) }, async ({
  plantedTree,
  repoRoot,
  runCli,
}) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
  unlinkSync(join(root, VOCABULARY));
  await expect(await runCli("verify", ["eslint-scoped", VOCABULARY], { cwd: root })).toExitWith(2);
});

test("missing map dependency refuses even when the vocabulary itself exists", { timeout: scaledBudget(30_000) }, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const M=registry.list();");
  unlinkSync(join(root, HOME_HELPER));
  await expect(await runCli("verify", ["eslint-scoped", HOME_HELPER], { cwd: root })).toExitWith(2);
});
