// Imported closure overlap must not change the compiler world delivered to a native lint partition.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { z } from "zod";
import { TEST_WORLD_PROGRAMS } from "../../../../tooling/src/floor/compiler/project-worlds.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { withProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import type { EslintCompletedProfiles } from "../../../../tooling/src/verify/contract/config-snapshot.ts";
import { TYPED_NATIVE_COMPILER_CONTEXT_ENV } from "../../../../tooling/src/verify/lib/typed-native-inputs.ts";
import { readEslintFileAdmissions } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { hasCompletedProfiles, runProfiles } from "../../../../tooling/src/verify/ops/eslint-profile.ts";

const ISO_SOURCE = "tests/support/iso/shared.ts";
const NODE_SOURCE = "tests/support/node/entry.ts";
const BROWSER_SOURCE = "tests/support/browser/entry.ts";
const SYNTAX_SOURCE = "syntax.js";
const CONFIG = "eslint.config.js";
const OBSERVATIONS = ".cache/owner-observations.jsonl";
const SOURCES = [ISO_SOURCE, NODE_SOURCE, BROWSER_SOURCE, SYNTAX_SOURCE];
const compilerOptions = { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" };
const observation = z.object({ file: z.string(), config: z.string(), context: z.array(z.string()) });

function observed(root: string): z.infer<typeof observation>[] {
  return readFileSync(join(root, OBSERVATIONS), "utf8")
    .trim()
    .split("\n")
    .map((line) => observation.parse(JSON.parse(line)));
}

async function worldFixture(plantedTree: ToolFixtures["plantedTree"], repoRoot: string): Promise<string> {
  const root = await plantedTree({
    "package.json": '{"name":"eslint-owner-fixture","type":"module","private":true}',
    ".gitignore": "node_modules\n.cache\nreports\n",
    [TEST_WORLD_PROGRAMS.node]: JSON.stringify({ compilerOptions, files: [NODE_SOURCE, "node-world.d.ts"] }),
    [TEST_WORLD_PROGRAMS.browser]: JSON.stringify({ compilerOptions, files: [BROWSER_SOURCE, "browser-world.d.ts"] }),
    [TEST_WORLD_PROGRAMS.iso]: JSON.stringify({ compilerOptions, files: [ISO_SOURCE, "iso-world.d.ts"] }),
    "node-world.d.ts": 'declare const worldIdentity: "node";',
    "browser-world.d.ts": 'declare const worldIdentity: "browser";',
    "iso-world.d.ts": 'declare const worldIdentity: "iso";',
    [ISO_SOURCE]: "export const shared = worldIdentity;",
    [NODE_SOURCE]: 'export { shared } from "../iso/shared.ts";',
    [BROWSER_SOURCE]: 'export { shared } from "../iso/shared.ts";',
    [SYNTAX_SOURCE]: "export const syntaxOnly = true;",
    [CONFIG]: `import tseslint from ${JSON.stringify(pathToFileURL(join(repoRoot, "node_modules/typescript-eslint/dist/index.js")).href)};
import {appendFileSync} from "node:fs";
import {join,relative} from "node:path";
const capture={meta:{schema:[]},create(context){
  const program=context.sourceCode.parserServices.program;
  if(!program)throw new Error("typed fixture has no compiler Program");
  const configured=JSON.parse(process.env[${JSON.stringify(TYPED_NATIVE_COMPILER_CONTEXT_ENV)}]);
  appendFileSync(join(context.cwd,${JSON.stringify(OBSERVATIONS)}),JSON.stringify({
    file:relative(context.cwd,context.filename),
    config:relative(context.cwd,program.getCompilerOptions().configFilePath),
    context:configured.configs
  })+"\\n");
  return {};
}};
export default [
  {ignores:["node_modules/**",".cache/**","reports/**","scripts/**","*.config.js"]},
  {files:["tests/**/*.ts"],languageOptions:{parser:tseslint.parser,parserOptions:{project:${JSON.stringify(Object.values(TEST_WORLD_PROGRAMS).toSorted())},projectService:false,tsconfigRootDir:import.meta.dirname}},plugins:{probe:{rules:{capture}}},rules:{"probe/capture":"error"}},
  {files:[${JSON.stringify(SYNTAX_SOURCE)}],rules:{"no-debugger":"error"}}
];`,
    "eslint-hard.config.js": 'export default [{files:["tests/**/*.ts","syntax.js"],rules:{"no-debugger":"error"}}];',
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
  });
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
  return root;
}

for (const singleRun of ["true", "false"]) {
  test(`native partitions pin overlapping worlds with single-run parsing ${singleRun}`, { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
    const root = await worldFixture(plantedTree, repoRoot);
    const admitted = await readEslintFileAdmissions(root, CONFIG, SOURCES);
    await withProcessEnv("TSESTREE_SINGLE_RUN", singleRun, async () => {
      expect(await runProfiles(root, admitted, "owner-proof-")).toBe(0);
      expect(observed(root).toSorted((left, right) => left.file.localeCompare(right.file))).toEqual(
        [
          { file: ISO_SOURCE, config: TEST_WORLD_PROGRAMS.iso, context: [TEST_WORLD_PROGRAMS.iso] },
          { file: NODE_SOURCE, config: TEST_WORLD_PROGRAMS.node, context: [TEST_WORLD_PROGRAMS.node] },
          { file: BROWSER_SOURCE, config: TEST_WORLD_PROGRAMS.browser, context: [TEST_WORLD_PROGRAMS.browser] },
        ].toSorted((left, right) => left.file.localeCompare(right.file)),
      );
      expect(await runProfiles(root, admitted, "owner-proof-")).toBe(0);
      expect(observed(root)).toHaveLength(3);
      writeFileSync(join(root, SYNTAX_SOURCE), "debugger;\n");
      expect(await runProfiles(root, admitted, "owner-proof-")).toBe(1);
      expect(observed(root)).toHaveLength(3);
    });
  });
}

test("completed profiles reject a changed primary owner without changed source or lint config", { tags: ["slow"] }, async ({ plantedTree, repoRoot }) => {
  const root = await worldFixture(plantedTree, repoRoot);
  const completed = new Map<string, EslintCompletedProfiles>();
  const admitted = await readEslintFileAdmissions(root, CONFIG, [ISO_SOURCE]);
  expect(await runProfiles(root, admitted, "owner-proof-", { completed })).toBe(0);
  expect(await hasCompletedProfiles(root, [ISO_SOURCE], completed)).toBe(true);
  const alternate = "tsconfig.alternate.json";
  writeFileSync(join(root, TEST_WORLD_PROGRAMS.iso), JSON.stringify({ files: [] }));
  writeFileSync(join(root, alternate), JSON.stringify({ compilerOptions, files: [ISO_SOURCE, "iso-world.d.ts"] }));
  execFixtureGit(root, ["add", "."]);
  expect(await hasCompletedProfiles(root, [ISO_SOURCE], completed)).toBe(false);
  expect(await runProfiles(root, admitted, "owner-proof-", { completed })).toBe(0);
  expect(observed(root).at(-1)).toEqual({ file: ISO_SOURCE, config: alternate, context: [alternate] });
});
