// THE CENSUS PIN for #1590: every tracked `tests/**/*.ts`/`*.tsx` file must resolve to a REAL eslint config
// block, not just avoid a red on the ones someone remembered to run. Before #1590, 32 `.tsx` story/fixture
// modules sat outside every `files` glob in `eslint.config.js` — `*.fixtures.tsx` under `tests/client`
// (only `tests/ui/**/*.fixtures.tsx` had a home), every underscore-prefixed story module other than the
// exact filename `_ct-stories.tsx`, and `tests/ui/**/*.stories.tsx` / `tests/ui/**/_*.tsx` (neither had a
// tests/ui equivalent of the client/tooling `_ct-stories.tsx` exemption). `pnpm exec eslint <file>
// --max-warnings 0` answered "File ignored because no matching configuration was supplied" for every one of
// them — a real defect (the CT surface's react-hooks/Compiler/jsx-a11y rules never reached them) that the
// scoped verify lane could not see (`resolveSelection`'s scoped argv passes `--no-warn-ignored`, per
// `run.int.test.ts`'s #459/#473 pins).
//
// NO ARM HERE DECLARES ITS OWN `timeout`, AND THAT IS NOT A MISSING LOAD BUDGET (#2218, filed, RETRACTED by
// its author, implemented anyway, then REFUTED with a planted control by cb-v-instruments-3 and reverted on
// 2026-09-13). `vitest.config.ts:90` sets `testTimeout: budget(5000)` at the ROOT and the `tooling` project
// carries `extends: true` with no `testTimeout` of its own, so a body with no `timeout` option is ALREADY
// load-scaled: `scaledBudget(5000)` is the identical call (`budget(base, readBoxLoad, FACTOR_CAP)`) and
// adding it changed nothing but the moment the box was sampled. The receipt is a resolved-config read under
// a planted `ORB_BOX_LOAD="48/16"`: root `testTimeout: 15000`, tooling project `own testTimeout: undefined`.
// The ONE arm that declares a budget is the last one, which genuinely needs more than the 5 s default.
//
// THE ORACLE: `ESLint#calculateConfigForFile` returning `undefined` for a real tracked file IS "no matching
// configuration" — the same signal #1574's own census used. This walks the WHOLE `tests/**` ts+tsx census
// (via `git ls-files`, so an untracked file cannot masquerade as covered) and asserts the uncovered set is
// EXACTLY EMPTY — not "31" or "32" (a literal count is a lie the day after a file is added; #1336's own
// lesson), so a future story/fixture module that lands outside every glob reds HERE instead of silently
// widening the hole again.
import { execSync } from "node:child_process";
import { BROWSER_PACKAGES, isNodeToolSource, PACKAGE_WORLDS } from "@orb/tooling/_shared/project-worlds";
import { ESLint } from "eslint";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

/** Below this the derivation stopped reading (a moved tree, a broken `git ls-files`) — a bare zero census
 *  would read exactly like "everything is covered", which is the failure mode this pin exists to name. */
const MIN_CENSUS_FILES = 1000;
const LS_FILES_MAX_BUFFER = 268_435_456;

/** Every tracked `tests/**` TS/TSX file, as repo-relative posix paths (sorted). */
function testCensus(root: string): readonly string[] {
  const out = execSync("git ls-files -- 'tests/**/*.ts' 'tests/**/*.tsx'", { cwd: root, maxBuffer: LS_FILES_MAX_BUFFER })
    .toString()
    .split("\n")
    .filter((line) => line.trim() !== "");
  return out.toSorted();
}

/** The census files `calculateConfigForFile` reports NO config for — the "File ignored" defect class. */
async function uncoveredFiles(root: string, files: readonly string[]): Promise<readonly string[]> {
  const eslint = new ESLint({ cwd: root });
  const out: string[] = [];
  for (const rel of files) {
    // Sequential by design (`noAwaitInLoops` is off repo-wide — see async-policy-config.int.test.ts's own
    // pin): one config-resolution call per file, no shared mutable state to race. The whole ~2700-file
    // census MEASURED 1.2-2.5 s across five runs on this 16-core fenced box — 1206 ms and 1453 ms solo,
    // 2470 ms inside a three-file `pnpm test:scoped`. The word "regardless" used to sit here and was the one
    // item #2218's retraction kept: it is a range that moves with the box, not a constant, which is why the
    // arm leans on the config's own `budget(5000)` rather than on this sentence.
    const config = await eslint.calculateConfigForFile(rel).catch(() => undefined);
    if (config === undefined) {
      out.push(rel);
    }
  }
  return out;
}

test("every tracked tests/** TS/TSX file resolves to a real eslint config block — zero `File ignored`", async ({ repoRoot }) => {
  const census = testCensus(repoRoot);
  expect(census.length).toBeGreaterThan(MIN_CENSUS_FILES);

  const uncovered = await uncoveredFiles(repoRoot, census);
  expect(
    uncovered,
    uncovered.length === 0
      ? undefined
      : `${uncovered.length} tests/** file(s) match NO eslint config block (add a \`files\` glob in eslint.config.js, or a documented exclusion + its own pin):\n  ${uncovered.join("\n  ")}`,
  ).toEqual([]);
});

test("every tracked root/package-root/direct-script Node tool resolves to a real eslint config block", async ({ repoRoot }) => {
  const census = execSync("git ls-files -- '*.ts' '*.mts' '*.cts'", { cwd: repoRoot, maxBuffer: LS_FILES_MAX_BUFFER })
    .toString()
    .split("\n")
    .filter(isNodeToolSource)
    .toSorted();
  expect(census).toEqual(expect.arrayContaining(["knip.ts", "playwright-ct.config.ts", "packages/ui/token-contract.ts"]));
  expect(await uncoveredFiles(repoRoot, census)).toEqual([]);
});

test("generated sandboxes and caches are excluded while authored JavaScript remains linted", async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  expect(await eslint.isPathIgnored(".stryker-tmp/sandbox-probe/stryker-setup-0.js")).toBe(true);
  expect(await eslint.isPathIgnored(".cache/eslint-discovery-probe.mjs")).toBe(true);
  const results = await eslint.lintText("/* eslint-disable no-empty-pattern */\nexport const value = 1;\n", {
    filePath: "scripts/temporary-lint-control.js",
  });
  expect(results).toHaveLength(1);
  expect(results[0]?.messages.some(({ message }) => message.includes("Unused eslint-disable directive"))).toBe(true);
});

test("every tracked non-browser package source resolves to a real eslint config block", async ({ repoRoot }) => {
  const packagePrefixes = Object.keys(PACKAGE_WORLDS)
    .filter((name) => !BROWSER_PACKAGES.has(name))
    .map((name) => `packages/${name}/src/`);
  const census = execSync("git ls-files -- 'packages/*/src/*.ts' 'packages/*/src/**/*.ts'", { cwd: repoRoot, maxBuffer: LS_FILES_MAX_BUFFER })
    .toString()
    .split("\n")
    .filter((path) => packagePrefixes.some((prefix) => path.startsWith(prefix)))
    .toSorted();
  expect(census).toContain("packages/showcase-plugins/src/index.ts");
  expect(await uncoveredFiles(repoRoot, census)).toEqual([]);
});

test("the Node-tool surface executes the type-aware promise diagnostic", { timeout: scaledBudget(15_000) }, async ({ repoRoot }) => {
  const eslint = new ESLint({ cwd: repoRoot });
  const [result] = await eslint.lintText("Promise.resolve('dropped');\n", { filePath: "knip.ts", warnIgnored: true });
  expect(result?.messages.map(({ ruleId }) => ruleId)).toContain("@typescript-eslint/no-floating-promises");
});
