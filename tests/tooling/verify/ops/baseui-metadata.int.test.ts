// Metadata-only scopes exercise the actual native rules through the existing production ESLint runner.
// @subject tooling/src/verify/lib/baseui-manifest.ts
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { Selection } from "@orb/tooling/verify";
import { REGISTRY, runScopedEslint } from "@orb/tooling/verify";
import { BASE_UI_NATIVE_INPUT_PATHS } from "../../../../tooling/src/verify/contract/baseui.ts";
import { JSON_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-json.ts";

const MANIFEST = JSON_RESOURCE_PATHS["baseui-manifest"];
const SOURCE = "packages/ui/src/probe.tsx";
const BAD =
  'import {Select as Base} from "@base-ui/react/select";export interface SealProps{disabled?:boolean}export const Seal=(p:SealProps)=><Base.Root {...p}/>;';
const GOOD =
  'import {Select as Base,type SelectRootProps} from "@base-ui/react/select";export interface SealProps{disabled?:SelectRootProps<string>["disabled"]}export const Seal=(p:SealProps)=><Base.Root {...p}/>;';

function nativeRoot(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  return plantedTree({
    ...Object.fromEntries(BASE_UI_NATIVE_INPUT_PATHS.map((path) => [path, readFileSync(join(repoRoot, path), "utf8")])),
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": `import config from ${config};export default [...config,{files:["ordinary.js"],rules:{"no-alert":"error"}}];`,
    "eslint-hard.config.js": `export {hardConfig as default} from ${config};`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [SOURCE]: source,
    "ordinary.js": "alert('unlicensed');\n",
  });
}

function metadataSelection(path: string): Selection {
  return {
    kind: "changed",
    label: "native metadata",
    paths: [path],
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

test("the real registry carries metadata-only and deleted inputs without claiming ordinary sources", () => {
  const row = REGISTRY.find(({ name }) => name === "lint:eslint");
  for (const path of BASE_UI_NATIVE_INPUT_PATHS) {
    expect(row?.scopedArgv?.(metadataSelection(path))).toEqual(["node", "tooling/src/verify/cli.ts", "eslint-scoped", path]);
  }
  const selected = metadataSelection(MANIFEST);
  expect(row?.scopedArgv?.({ ...selected, paths: [MANIFEST, "ordinary.js"], eslintPaths: ["ordinary.js"] })).toEqual([
    "node",
    "tooling/src/verify/cli.ts",
    "eslint-scoped",
    "ordinary.js",
    MANIFEST,
  ]);
  expect(row?.scopedArgv?.({ ...selected, paths: ["docs/law/Constitution.md"] })).toBe("skip-empty");
});

test("metadata alone rejudges actual native UI syntax without an ordinary compiler owner", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, BAD);
  expect(await runScopedEslint(root, [MANIFEST])).toBe(1);
  writeFileSync(join(root, SOURCE), GOOD);
  expect(await runScopedEslint(root, [MANIFEST])).toBe(0);
});

for (const allowed of [false, true]) {
  test(`mixed metadata and source still run every ordinary source rule: ${allowed ? "legal" : "blocked"}`, async ({ plantedTree, repoRoot }) => {
    const root = await nativeRoot(plantedTree, repoRoot, GOOD);
    writeFileSync(join(root, "ordinary.js"), allowed ? "export const licensed=1;\n" : "alert('unlicensed');\n");
    expect(await runScopedEslint(root, [MANIFEST, "ordinary.js"])).toBe(allowed ? 0 : 1);
  });
}

for (const path of [MANIFEST, "tooling/src/verify/lib/baseui-manifest.ts"] as const) {
  test(`a deleted native metadata dependency is a real CLI tool error: ${path}`, async ({ plantedTree, repoRoot, runCli }) => {
    const root = await nativeRoot(plantedTree, repoRoot, GOOD);
    unlinkSync(join(root, path));
    await expect(await runCli("verify", ["eslint-scoped", path], { cwd: root })).toExitWith(2);
  });
}

test("empty, unparseable and wrong-shaped metadata never skip green", async ({ plantedTree, repoRoot }) => {
  const root = await nativeRoot(plantedTree, repoRoot, GOOD);
  for (const text of ["", "{ not json", '{"version":"1.8.0","components":{"Select":{}}}']) {
    writeFileSync(join(root, MANIFEST), text);
    await expect(runScopedEslint(root, [MANIFEST])).rejects.toThrow();
  }
});
