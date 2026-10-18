// Native profiles run through the production partition runner with real CLI caches and directives.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { runEslint, runScopedEslint } from "../../../../tooling/src/verify/ops/eslint.ts";
import { scaledBudget } from "../../_load-budget.ts";

const SOURCE = "source.js";
const RUNNER_MODES = ["scoped", "whole"] as const;
const BULK_LEDGER = "eslint-suppressions.json";
const CACHE_DIR = ".cache/eslint";
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

test.for(RUNNER_MODES)(
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

test.for(RUNNER_MODES)("the real %s runner isolates clean HARD lint from valid ordinary bulk debt", async (mode, { plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "alert('bulk-owned');\n");
  const ledger = JSON.stringify({ [SOURCE]: { "no-alert": { count: 1 } } });
  writeFileSync(join(root, BULK_LEDGER), ledger);
  expect(mode === "whole" ? await runEslint(root) : await runScopedEslint(root, [SOURCE])).toBe(0);
  expect(readFileSync(join(root, BULK_LEDGER), "utf8")).toBe(ledger);
  expect(readdirSync(join(root, CACHE_DIR)).filter((name) => name.startsWith("argv-"))).toEqual([]);
});

test.for(RUNNER_MODES)("the real %s runner cannot grant HARD permission through an ordinary bulk rule entry", async (mode, { plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "debugger;\n");
  writeFileSync(join(root, "eslint.config.js"), HARD_DEBUGGER_CONFIG);
  const ledger = JSON.stringify({ [SOURCE]: { "no-restricted-syntax": { count: 1 } } });
  writeFileSync(join(root, BULK_LEDGER), ledger);
  expect(mode === "whole" ? await runEslint(root) : await runScopedEslint(root, [SOURCE])).toBe(1);
  expect(readFileSync(join(root, BULK_LEDGER), "utf8")).toBe(ledger);
  expect(readdirSync(join(root, CACHE_DIR)).filter((name) => name.startsWith("argv-"))).toEqual([]);
});

test.for(RUNNER_MODES)("the real %s runner retains the native stale ordinary bulk ledger error", async (mode, { plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "void 0;\n");
  const ledger = JSON.stringify({ [SOURCE]: { "no-alert": { count: 1 } } });
  writeFileSync(join(root, BULK_LEDGER), ledger);
  expect(mode === "whole" ? await runEslint(root) : await runScopedEslint(root, [SOURCE])).toBe(2);
  expect(readFileSync(join(root, BULK_LEDGER), "utf8")).toBe(ledger);
  expect(readdirSync(join(root, CACHE_DIR)).filter((name) => name.startsWith("argv-"))).toEqual([]);
});

test("the hard child ignores unrelated directives without breaking an actual ordinary exception", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, ORDINARY_PERMISSION);
  expect(await runScopedEslint(root, [SOURCE])).toBe(0);
  writeFileSync(join(root, SOURCE), "alert('unlicensed');\n");
  expect(await runScopedEslint(root, [SOURCE])).toBe(1);
});

test(
  "native warm caches invalidate changed hard options and keep whole and scoped profiles separate",
  async ({ plantedTree, repoRoot }) => {
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
    const caches = join(root, CACHE_DIR);
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
  },
  scaledBudget(30_000),
);

test("a hard profile refuses typed subjects without canonical compiler admission", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "debugger;\n");
  writeFileSync(
    join(root, HARD_CONFIG),
    `export default [{ files: ["source.js"], languageOptions: { parserOptions: { projectService: true } }, rules: { "no-restricted-syntax": ["error", "DebuggerStatement"] } }];`,
  );
  await expect(runScopedEslint(root, [SOURCE])).rejects.toThrow("HARD native compiler admission is unavailable");
});

test(
  "the mandatory real CLI consumes the canonical production HARD network profile",
  async ({ plantedTree, repoRoot, runCli }) => {
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
  },
  scaledBudget(30_000),
);
