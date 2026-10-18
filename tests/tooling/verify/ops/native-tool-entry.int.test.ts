import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { runEslint } from "../../../../tooling/src/verify/ops/eslint.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CLI = "tooling/src/demo/cli.ts";
const RUNNER = "tooling/src/floor/cli/run-tool.ts";
const RULE = "orb/tooling-cli-entry";

async function entryTree(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  const config = JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href);
  const root = await plantedTree({
    ".gitignore": ".cache\nnode_modules\n",
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": `import {hardConfig} from ${config}; const row=hardConfig.find(row=>row.rules?.[${JSON.stringify(RULE)}]); export default [{files:["**/*.ts"],languageOptions:{parser:row.languageOptions.parser},plugins:row.plugins,rules:{["orb/tooling-cli-entry"]:"off"},linterOptions:{reportUnusedDisableDirectives:"off"}}];`,
    "eslint-hard.config.js": `import {hardConfig} from ${config}; const row=hardConfig.find(row=>row.rules?.[${JSON.stringify(RULE)}]); export default [{...row,languageOptions:{...row.languageOptions,parserOptions:{project:"./tooling/tsconfig.json",projectService:false,tsconfigRootDir:import.meta.dirname}}},{linterOptions:{noInlineConfig:true,reportUnusedDisableDirectives:"off"}}];`,
    "tooling/tsconfig.json": JSON.stringify({
      compilerOptions: { noLib: true, types: [], strict: true, module: "ESNext", moduleResolution: "Bundler" },
      include: ["src/**/*.ts"],
    }),
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [RUNNER]: "export function runTool(main:()=>number):void{void main;}\n",
    [CLI]: source,
  });
  execFixtureGit(root, ["init", "--quiet"]);
  return root;
}

test("real typed HARD partition distinguishes canonical aliases from local fakes despite inline and bulk permissions", {
  timeout: scaledBudget(30_000),
}, async ({ plantedTree, repoRoot, runCli }) => {
  const root = await entryTree(
    plantedTree,
    repoRoot,
    `/* eslint "${RULE}":"off" */\n// eslint-disable-next-line ${RULE} -- Attempted HARD permission.\nfunction runTool(main:()=>number){void main;} runTool(()=>0);\n`,
  );
  const real = "tooling/src/real/cli.ts";
  mkdirSync(join(root, "tooling/src/real"), { recursive: true });
  writeFileSync(join(root, real), 'import {runTool as run} from "../floor/cli/run-tool.ts"; run(()=>0);\n');
  const ledger = JSON.stringify({ [CLI]: { [RULE]: { count: 1 } } });
  writeFileSync(join(root, "eslint-suppressions.json"), ledger);
  const result = await runCli("verify", ["eslint"], { cwd: root });
  await expect(result).toExitWith(2);
  expect(result.stderr).toContain("suppressions left that do not occur anymore");
  expect(result.stdout).toContain(CLI);
  expect(result.stdout).not.toContain(real);
  expect(result.stdout).toContain("no proven entry exists");
  expect(result.stdout).toContain("1 error, 0 warnings");
  expect(readFileSync(join(root, "eslint-suppressions.json"), "utf8")).toBe(ledger);
  expect(readdirSync(join(root, ".cache/eslint"))).toContain("hard-tooling%2Ftsconfig.json.eslintcache");
});

test("typed HARD refuses a configured parser world that differs from native file membership", async ({ plantedTree }) => {
  const root = await plantedTree({
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": 'export default [{files:["**/*.ts"]}];',
    "eslint-hard.config.js":
      'export default [{files:["**/*.ts"],languageOptions:{parserOptions:{project:["tsconfig.other.json"]}},rules:{"no-debugger":"error"}}];',
    "tooling/tsconfig.json": JSON.stringify({ files: ["src/demo/cli.ts"] }),
    "tsconfig.other.json": JSON.stringify({ files: [] }),
    [CLI]: "export const value=1;\n",
  });
  execFixtureGit(root, ["init", "--quiet"]);
  await expect(runEslint(root)).rejects.toThrow("HARD native compiler admission does not match owner tooling/tsconfig.json");
});
