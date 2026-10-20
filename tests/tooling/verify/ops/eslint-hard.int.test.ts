// Native profiles run through the production partition runner with real CLI caches and directives.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ToolFixtures } from "@orb/testkit/node/tool-fixtures.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "../../../../tooling/src/floor/git/git-fixture.ts";
import { withProcessEnv } from "../../../../tooling/src/floor/process/process-env.ts";
import type { EslintCompletedProfiles } from "../../../../tooling/src/verify/contract/config-snapshot.ts";
import { readEslintFileAdmissions } from "../../../../tooling/src/verify/ops/config-snapshot.ts";
import { runEslint, runScopedEslint } from "../../../../tooling/src/verify/ops/eslint.ts";
import { hasCompletedProfiles, runProfiles } from "../../../../tooling/src/verify/ops/eslint-profile.ts";
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

test(
  "the scoped run refuses a named file that no config admits instead of reporting it clean",
  async ({ plantedTree, repoRoot }) => {
    const root = await rootFor(plantedTree, repoRoot, "alert('named');\n");
    writeFileSync(join(root, "named.ts"), "alert('named');\n");
    expect(await runScopedEslint(root, [SOURCE])).toBe(1);
    expect(await runScopedEslint(root, ["named.ts"])).toBe(2);
  },
  scaledBudget(30_000),
);

test(
  "a patched rule module drops the cached clean verdict for an unchanged named file",
  async ({ plantedTree, repoRoot }) => {
    const root = await rootFor(plantedTree, repoRoot, "void 0;\n");
    const rule = (reports: boolean): string =>
      `export default { rules: { named: { create: (context) => ({ Program: (node) => { if (${String(reports)}) context.report({ node, message: "planted" }); } }) } } };`;
    writeFileSync(join(root, "plugin.js"), rule(false));
    writeFileSync(
      join(root, "eslint.config.js"),
      `import plugin from "./plugin.js"; export default [{ files: ["**/*.js"], plugins: { orb: plugin }, rules: { "orb/named": "error" } }];`,
    );
    expect(await runScopedEslint(root, [SOURCE])).toBe(0);
    writeFileSync(join(root, "plugin.js"), rule(true));
    expect(await runScopedEslint(root, [SOURCE])).toBe(1);
  },
  scaledBudget(30_000),
);

test(
  "a named file spelled ./relative or absolute lints exactly like its repository-relative spelling",
  async ({ plantedTree, repoRoot }) => {
    const root = await rootFor(plantedTree, repoRoot, "alert('named');\n");
    expect(await runScopedEslint(root, [SOURCE])).toBe(1);
    expect(await runScopedEslint(root, [`./${SOURCE}`])).toBe(1);
    expect(await runScopedEslint(root, [join(root, SOURCE)])).toBe(1);
  },
  scaledBudget(30_000),
);

test(
  "an edit inside an installed plugin drops the cached clean verdict for an unchanged named file",
  async ({ plantedTree, repoRoot }) => {
    const root = await rootFor(plantedTree, repoRoot, "void 0;\n");
    const rule = (reports: boolean): string =>
      `export default { rules: { named: { create: (context) => ({ Program: (node) => { if (${String(reports)}) context.report({ node, message: "planted" }); } }) } } };`;
    mkdirSync(join(root, "node_modules/orb-installed-plugin"), { recursive: true });
    writeFileSync(join(root, "node_modules/orb-installed-plugin/package.json"), '{"name":"orb-installed-plugin","type":"module","main":"index.js"}');
    writeFileSync(join(root, "node_modules/orb-installed-plugin/index.js"), rule(false));
    writeFileSync(
      join(root, "eslint.config.js"),
      `import plugin from "orb-installed-plugin"; export default [{ files: ["**/*.js"], plugins: { orb: plugin }, rules: { "orb/named": "error" } }];`,
    );
    expect(await runScopedEslint(root, [SOURCE])).toBe(0);
    writeFileSync(join(root, "node_modules/orb-installed-plugin/index.js"), rule(true));
    expect(await runScopedEslint(root, [SOURCE])).toBe(1);
  },
  scaledBudget(30_000),
);

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

test("completed profiles retain violations but refuse changed source, options, environments and nonexact operands", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "debugger;\n");
  const completed = new Map<string, EslintCompletedProfiles>();
  const admitted = await readEslintFileAdmissions(root, "eslint.config.js", [SOURCE]);
  expect(await runProfiles(root, admitted, "metadata-proof-", completed)).toBe(1);
  expect(await hasCompletedProfiles(root, [SOURCE], completed)).toBe(true);
  for (const paths of [[SOURCE, SOURCE], ["."], ["*.js"], ["missing.js"]]) {
    expect(await hasCompletedProfiles(root, paths, completed)).toBe(false);
  }
  await withProcessEnv("ORB_ESLINT_COVERAGE_CONTROL", "changed", async () => {
    expect(await hasCompletedProfiles(root, [SOURCE], completed)).toBe(false);
  });
  writeFileSync(join(root, SOURCE), "void 0;\n");
  expect(await hasCompletedProfiles(root, [SOURCE], completed)).toBe(false);
  writeFileSync(join(root, SOURCE), "debugger;\n");
  writeFileSync(join(root, HARD_CONFIG), HARD_DEBUGGER_CONFIG.replace("DebuggerStatement", "Identifier"));
  expect(await hasCompletedProfiles(root, [SOURCE], completed)).toBe(false);
  writeFileSync(
    join(root, HARD_CONFIG),
    `${HARD_DEBUGGER_CONFIG.slice(0, -2)}, { files: ["source.js"], languageOptions: { parserOptions: { projectService: true } } }];`,
  );
  expect(await hasCompletedProfiles(root, [SOURCE], completed)).toBe(false);
});

test("an ordinary native tool error cannot promote completed HARD work into full profile coverage", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "void 0;\n");
  writeFileSync(join(root, BULK_LEDGER), JSON.stringify({ [SOURCE]: { "no-alert": { count: 1 } } }));
  const completed = new Map<string, EslintCompletedProfiles>();
  const admitted = await readEslintFileAdmissions(root, "eslint.config.js", [SOURCE]);
  expect(await runProfiles(root, admitted, "metadata-proof-", completed)).toBe(2);
  expect(completed.size).toBe(0);
  expect(await hasCompletedProfiles(root, [SOURCE], completed)).toBe(false);
});

test("an unknown configured compiler context cannot qualify completed native lint for reuse", async ({ plantedTree, repoRoot }) => {
  const root = await rootFor(plantedTree, repoRoot, "void 0;\n");
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { noLib: true, allowJs: true, types: [] }, files: [SOURCE] }));
  writeFileSync(
    join(root, "eslint.config.js"),
    'export default [{files:["source.js"],languageOptions:{parserOptions:{projectService:{loadTypeScriptPlugins:false}}},rules:{"no-alert":"error"}}];',
  );
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "."]);
  const completed = new Map<string, EslintCompletedProfiles>();
  const admitted = await readEslintFileAdmissions(root, "eslint.config.js", [SOURCE]);
  expect(admitted).toMatchObject([{ requiresTypeInformation: true, compilerConfigs: null }]);
  expect(await runProfiles(root, admitted, "metadata-proof-", completed)).toBe(0);
  expect(completed.size).toBe(0);
  expect(await hasCompletedProfiles(root, [SOURCE], completed)).toBe(false);
});

test(
  "the mandatory real CLI consumes the canonical production HARD network profile",
  async ({ plantedTree, repoRoot, runCli }) => {
    const source = "packages/server/src/native-hard-probe.ts";
    const root = await plantedTree({
      "package.json": '{"name":"native-hard-network-fixture","type":"module","private":true}',
      "eslint.config.js": 'export default [{ files: ["**/*.ts"] }];',
      [HARD_CONFIG]: `import { hardConfig } from ${JSON.stringify(pathToFileURL(join(repoRoot, "eslint.config.js")).href)}; export default [...hardConfig];`,
      "scripts/eslint.ts": `await import(${JSON.stringify(pathToFileURL(join(repoRoot, "scripts/eslint.ts")).href)});`,
      [source]: '/* eslint "no-restricted-syntax":"off", "@eslint-community/eslint-comments/no-use":"off" */\nexport const rejected="corsproxy.io";',
    });
    execFixtureGit(root, ["init", "-q"]);
    execFixtureGit(root, ["add", "."]);
    const result = await runCli("verify", ["eslint-scoped", source], { cwd: root });
    await expect(result).toExitWith(1);
    expect(result.stdout).toContain("D61 B5a:");
    expect(result.stdout).toContain("no-restricted-syntax");
    expect(result.stdout).toContain("1 error, 0 warnings");
  },
  scaledBudget(30_000),
);
