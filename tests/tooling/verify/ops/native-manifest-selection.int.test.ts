import { mkdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { configureFixtureGitIdentity, execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { resolveSelection } from "../../../../tooling/src/verify/lib/selection.ts";
import { TYPED_NATIVE_POLICIES } from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";
import { runScopedEslint } from "../../../../tooling/src/verify/ops/eslint.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI = "tooling/src/demo/cli.ts";
const MANIFESTS = ["tooling/package.json", "standalone/plugin/package.json", ".devcontainer/tools/package.json"] as const;
const DIRECTORIES = ["standalone/plugin", "standalone/plugin/", ".devcontainer/tools", ".devcontainer/tools/"] as const;
const DELETED = "standalone/deleted/package.json";
const OLD = "standalone/old/package.json";
const ADDED = "standalone/added/package.json";
const RENAMED = "standalone/renamed/package.json";
const SOURCE = "function runTool(main:()=>number):void{void main;} runTool(()=>0);\n";

async function manifestTree([plantedTree, repoRoot]: readonly [ToolFixtures["plantedTree"], string], typed = false): Promise<string> {
  const entry = TYPED_NATIVE_POLICIES.find(({ id }) => id === "tooling-cli-entry");
  if (entry === undefined) {
    throw new Error("entry metadata missing");
  }
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const files: Record<string, string> = {
    ".gitignore": "node_modules\n.cache\nreports\nscripts/ts7.ts\n",
    "package.json": '{"name":"manifest-selection-fixture","type":"module","private":true}',
    "pnpm-workspace.yaml": "packages:\n  - tooling\nnodeOptions: --max-old-space-size=16384\n",
    "scripts/ts7.ts": readFileSync(join(repoRoot, "scripts/ts7.ts"), "utf8"),
    "tsconfig.json": JSON.stringify({
      compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" },
      files: ["scripts/eslint.ts"],
    }),
    "tooling/tsconfig.json": JSON.stringify({
      compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" },
      files: ["src/demo/cli.ts", "src/floor/cli/run-tool.ts"],
    }),
    "eslint.config.js":
      'import tseslint from "typescript-eslint";export default [{ignores:["node_modules/**",".cache/**"]},{files:["**/*.ts"],languageOptions:{parser:tseslint.parser}}];',
    "eslint-hard.config.js": `import {hardConfig} from ${config};const row=hardConfig.find(row=>row.rules?.["orb/tooling-cli-entry"]);export default [{...row,languageOptions:{...row.languageOptions,parserOptions:{project:${typed ? '"./tooling/tsconfig.json"' : "false"},projectService:false,tsconfigRootDir:import.meta.dirname}}}];`,
    "scripts/eslint.ts": typed ? `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});` : "export {};",
    "tooling/src/floor/cli/run-tool.ts": "export function runTool(main:()=>number):void{void main;}\n",
    [CLI]: SOURCE,
    [DELETED]: '{"name":"deleted-manifest"}',
    [OLD]: '{"name":"renamed-manifest"}',
    "notes.txt": "unrelated\n",
    ...Object.fromEntries(MANIFESTS.map((path) => [path, JSON.stringify({ name: path.replaceAll("/", "-") })])),
  };
  if (typed) {
    for (const path of entry.inputs) {
      files[path] ??= readFileSync(join(repoRoot, path), "utf8");
    }
  }
  const root = await plantedTree(files);
  symlinkSync(join(repoRoot, "node_modules"), join(root, "node_modules"), "dir");
  execFixtureGit(root, ["init", "--quiet"]);
  configureFixtureGitIdentity(root);
  execFixtureGit(root, ["add", "."]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "fixture"]);
  return root;
}

function changeManifests(root: string): void {
  writeFileSync(join(root, MANIFESTS[0]), '{"name":"tooling-edited"}');
  mkdirSync(dirname(join(root, ADDED)), { recursive: true });
  writeFileSync(join(root, ADDED), '{"name":"added-manifest"}');
  rmSync(join(root, DELETED));
  mkdirSync(dirname(join(root, RENAMED)), { recursive: true });
  renameSync(join(root, OLD), join(root, RENAMED));
  execFixtureGit(root, ["add", "-A"]);
}

test("shared file, changed, staged and folder selection retains manifest identities", { timeout: scaledBudget(30_000) }, async ({ plantedTree, repoRoot }) => {
  const root = await manifestTree([plantedTree, repoRoot]);
  for (const path of [...MANIFESTS, CLI, "package.json", "tsconfig.json"]) {
    for (const kind of ["file", "changed"] as const) {
      expect(resolveSelection({ kind, paths: [path] }, root).eslintPaths, `${kind}: ${path}`).toContain(path);
    }
  }
  for (const glob of [...DIRECTORIES, "."]) {
    expect(resolveSelection({ kind: "scope", glob }, root).eslintPaths, glob).toContain(glob.replace(/\/$/u, ""));
  }
  expect(resolveSelection({ kind: "file", paths: ["notes.txt"] }, root).eslintPaths).toEqual([]);
  changeManifests(root);
  const identities = [MANIFESTS[0], ADDED, DELETED, OLD, RENAMED].toSorted();
  expect(resolveSelection({ kind: "staged" }, root).eslintPaths.toSorted()).toEqual(identities);
  expect(resolveSelection({ kind: "changed", paths: [] }, root).eslintPaths.toSorted()).toEqual(identities);
  for (const path of [ADDED, DELETED, OLD, RENAMED]) {
    expect(resolveSelection({ kind: "file", paths: [path] }, root).eslintPaths).toContain(path);
  }
});

for (const [label, paths] of [
  ["existing manifests", MANIFESTS],
  ["added, deleted and renamed manifests", [ADDED, DELETED, OLD, RENAMED]],
  ["manifest directories", DIRECTORIES],
] as const) {
  test(`scoped metadata dispatch reselects unchanged entry subjects for ${label}`, { timeout: scaledBudget(30_000) }, async ({ plantedTree, repoRoot }) => {
    const root = await manifestTree([plantedTree, repoRoot]);
    changeManifests(root);
    for (const path of paths) {
      await expect(runScopedEslint(root, [path]), path).rejects.toThrow(`Typed native policy subject ${CLI} has no native parser compiler owner`);
    }
    expect(await runScopedEslint(root, ["notes.txt"])).toBe(0);
    expect(readFileSync(join(root, CLI), "utf8")).toBe(SOURCE);
  });
}

test("a manifest-only scoped dispatch runs the real HARD rule on its unchanged canonical native owner", { timeout: scaledBudget(30_000) }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await manifestTree([plantedTree, repoRoot], true);
  expect(await runScopedEslint(root, [MANIFESTS[0]])).toBe(1);
  expect(readFileSync(join(root, CLI), "utf8")).toBe(SOURCE);
});
