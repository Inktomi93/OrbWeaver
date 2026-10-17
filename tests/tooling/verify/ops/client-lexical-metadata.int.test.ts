// Lexical helper edits must rejudge both frontend populations without enabling compiler Programs.
// @subject tooling/src/verify/lib/client-lexical-native.ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runScopedEslint } from "@orb/tooling/verify";
import tseslint from "typescript-eslint";
import { CLIENT_LEXICAL_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/lib/client-lexical-native.ts";

const HELPER = "tooling/src/verify/lib/tailwind-class-token.ts";
const CLIENT = "packages/client/src/components/probe.tsx";
const UI = "packages/ui/src/lib/probe.ts";

function nativeRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, client: string, ui = "export const legal=1;"): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const untyped = JSON.stringify(tseslint.configs.disableTypeChecked.rules);
  return plantedTree({
    ...Object.fromEntries(CLIENT_LEXICAL_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": `import config from ${config};export default [...config,{files:["ordinary.js",${JSON.stringify(HELPER)}],languageOptions:{parserOptions:{project:false,projectService:false,programs:null}},rules:{...${untyped},"no-alert":"error"}}];`,
    "eslint-hard.config.js": `export {hardConfig as default} from ${config};`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [CLIENT]: client,
    [UI]: ui,
    "ordinary.js": "export const legal=1;\n",
  });
}

test("registry retains deleted lexical helper without ordinary source", () => {
  const selection: Selection = {
    kind: "changed",
    label: "deleted lexical helper",
    paths: [HELPER],
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
  expect(REGISTRY.find(({ name }) => name === "lint:eslint")?.scopedArgv?.(selection)).toEqual(["node", "tooling/src/verify/cli.ts", "eslint-scoped", HELPER]);
});

test("helper-only edit rejudges client literal IDs", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, 'export const A=<div data-testid="raw"/>;');
  expect(await runScopedEslint(root, [HELPER])).toBe(1);
});

test("helper-only edit rejudges UI scroll literals", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const legal=1;", 'export const A="overflow-y-auto";');
  expect(await runScopedEslint(root, [HELPER])).toBe(1);
});

test("helper-only edit with legal frontend syntax is clean", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, 'export const A=<div data-testid={testId("key")}/>;', 'export const A="relative overflow-y-auto";');
  expect(await runScopedEslint(root, [HELPER])).toBe(0);
});

for (const allowed of [false, true]) {
  test(`lexical metadata mixed source retains ordinary lint: ${allowed ? "legal" : "blocked"}`, async ({ plantedTree, repoRoot }) => {
    const root = await nativeRoot(plantedTree, repoRoot, "export const legal=1;");
    writeFileSync(join(root, "ordinary.js"), allowed ? "export const legal=1;\n" : "alert('blocked');\n");
    expect(await runScopedEslint(root, [HELPER, "ordinary.js"])).toBe(allowed ? 0 : 1);
  });
}

test("missing lexical helper refuses at the actual CLI", async ({ plantedTree, repoRoot, runCli }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const legal=1;");
  unlinkSync(join(root, HELPER));
  await expect(await runCli("verify", ["eslint-scoped", HELPER], { cwd: root })).toExitWith(2);
});

test("zero frontend sources cannot certify the helper alone", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, "export const legal=1;");
  unlinkSync(join(root, CLIENT));
  unlinkSync(join(root, UI));
  await expect(runScopedEslint(root, [HELPER])).rejects.toThrow();
});
