// Native profiles run through the production partition runner with real CLI caches and directives.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runEslint, runScopedEslint } from "../../../../tooling/src/verify/ops/eslint.ts";

const SOURCE = "source.js";
const HARD_CONFIG = "eslint-hard.config.js";
const ORDINARY_CONFIG = `export default [{ files: ["**/*.js"], linterOptions: { reportUnusedDisableDirectives: "off" }, rules: { "no-alert": "error" } }];`;
const HARD_DEBUGGER_CONFIG = `export default [{ files: ["source.js"], linterOptions: { noInlineConfig: true }, rules: { "no-restricted-syntax": ["error", "DebuggerStatement"] } }];`;
const ORDINARY_PERMISSION = "// eslint-disable-next-line no-alert -- Native ordinary exception control.\nalert('owned');\n";

function rootFor(plantedTree: ToolFixtures["plantedTree"], repoRoot: string, source: string): Promise<string> {
  return plantedTree({
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": ORDINARY_CONFIG,
    [HARD_CONFIG]: HARD_DEBUGGER_CONFIG,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [SOURCE]: source,
  });
}

test.for(["scoped", "whole"] as const)(
  "the real %s runner cannot suppress a hard rule with directives or configuration comments",
  async (mode, { plantedTree, repoRoot, runCli }) => {
    const root = await rootFor(
      plantedTree,
      repoRoot,
      `${ORDINARY_PERMISSION}/* eslint "no-restricted-syntax":"off" */\n// eslint-disable-next-line no-restricted-syntax -- Attempted hard bypass.\ndebugger;\n`,
    );
    const result = await runCli("verify", mode === "whole" ? ["eslint"] : ["eslint-scoped", SOURCE], { cwd: root });
    await expect(result).toExitWith(1);
    expect(result.stdout).toContain("Using 'DebuggerStatement' is not allowed");
    expect(result.stdout).toContain("no-restricted-syntax");
  },
);

test("the hard child ignores unrelated directives without breaking an actual ordinary exception", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, ORDINARY_PERMISSION);
  expect(await runScopedEslint(root, [SOURCE])).toBe(0);
  writeFileSync(join(root, SOURCE), "alert('unlicensed');\n");
  expect(await runScopedEslint(root, [SOURCE])).toBe(1);
});

test("native warm caches invalidate changed hard options and keep whole and scoped profiles separate", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "debugger;\n");
  expect(await runScopedEslint(root, [SOURCE])).toBe(1);
  expect(await runScopedEslint(root, [SOURCE])).toBe(1);
  writeFileSync(
    join(root, HARD_CONFIG),
    `export default [{ files: ["source.js"], linterOptions: { noInlineConfig: true }, rules: { "no-restricted-syntax": ["error", "Identifier[name='forbidden']"] } }];`,
  );
  expect(await runScopedEslint(root, [SOURCE])).toBe(0);
  writeFileSync(join(root, HARD_CONFIG), HARD_DEBUGGER_CONFIG);
  expect(await runScopedEslint(root, [SOURCE])).toBe(1);
  expect(await runEslint(root)).toBe(1);
  const caches = join(root, ".cache/eslint");
  const whole = readdirSync(caches)
    .filter((name) => !name.startsWith("scoped-"))
    .toSorted();
  expect(whole).toContain("hard-%3Cuntyped%3E.eslintcache");
  expect(whole).toContain("%3Cuntyped%3E.eslintcache");
  const snapshots = whole.map((name) => readFileSync(join(caches, name), "utf8"));
  expect(await runScopedEslint(root, [SOURCE])).toBe(1);
  expect(whole.map((name) => readFileSync(join(caches, name), "utf8"))).toEqual(snapshots);
  expect(readdirSync(caches)).toContain("scoped-hard-%3Cuntyped%3E.eslintcache");
  expect(readdirSync(caches)).toContain("scoped-%3Cuntyped%3E.eslintcache");
});

test("a hard profile requesting type information refuses before a compiler or child can start", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "debugger;\n");
  writeFileSync(
    join(root, HARD_CONFIG),
    `export default [{ files: ["source.js"], languageOptions: { parserOptions: { projectService: true } }, rules: { "no-restricted-syntax": ["error", "DebuggerStatement"] } }];`,
  );
  await expect(runScopedEslint(root, [SOURCE])).rejects.toThrow("hard ESLint profile requested type information for source.js");
});

test("the mandatory real CLI consumes the canonical production HARD network profile", async ({ plantedTree, repoRoot, runCli }) => {
  const source = "packages/server/src/native-hard-probe.ts";
  const root = await plantedTree({
    "package.json": '{"type":"module","private":true}',
    "eslint.config.js": 'export default [{ files: ["**/*.ts"] }];',
    [HARD_CONFIG]: `import { hardConfig } from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)}; export default [...hardConfig];`,
    "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
    [source]: '/* eslint "no-restricted-syntax":"off", "@eslint-community/eslint-comments/no-use":"off" */\nexport const rejected="corsproxy.io";',
  });
  const result = await runCli("verify", ["eslint-scoped", source], { cwd: root });
  await expect(result).toExitWith(1);
  expect(result.stdout).toContain("D61 B5a:");
  expect(result.stdout).toContain("no-restricted-syntax");
  expect(result.stdout).toContain("1 error, 0 warnings");
});
