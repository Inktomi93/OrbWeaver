// What the client build moves or adds around source code, built through packages/client/vite.config.ts itself: a
// conditional whose test the bundler inlines starts on another line yet lands on its source branch, and the arrows the
// build wraps around `import()` calls are no source function, so no hit on one is left unmatched.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { transformWithOxc } from "vite";
import { z } from "zod";
import { COVERAGE_DIR_ENV, COVERAGE_LAYOUT, flattenHits, sourceFileName } from "../../../tooling/src/floor/testing/coverage-collection.ts";
import { convertBrowserRun, istanbulOf } from "../../../tooling/src/unwired/coverage-convert.ts";
import type { IstanbulMap } from "../../../tooling/src/unwired/coverage-merge.ts";
import { mergeCoverage } from "../../../tooling/src/unwired/coverage-merge.ts";

const CHUNK = "main.js";
const URL_OF_CHUNK = "http://127.0.0.1/assets/main.js";
// The map fields the converter reads, which oxc's map type leaves optional.
const oxcMapSchema = z.object({ version: z.number(), names: z.array(z.string()), mappings: z.string() });

// Builds the planted entry the way the CT gallery builds it under `pnpm unwired coverage`.
function buildChunk(repoRoot: string, root: string, entry: string): string {
  const out = join(root, "out");
  const inline = {
    configFile: join(repoRoot, "packages/client/vite.config.ts"),
    configLoader: "native",
    mode: "component-test",
    logLevel: "silent",
    cacheDir: join(root, "vite-cache"),
    build: {
      outDir: out,
      emptyOutDir: true,
      rolldownOptions: { input: join(root, entry), preserveEntrySignatures: "exports-only", output: { entryFileNames: CHUNK } },
    },
  };
  execFileSync(process.execPath, ["--input-type=module", "-e", `import { build } from "vite"; await build(${JSON.stringify(inline)});`], {
    cwd: join(repoRoot, "packages/client"),
    env: inheritedProcessEnv(
      Object.fromEntries([
        [COVERAGE_DIR_ENV, join(root, "run")],
        ["NODE_ENV", "development"],
      ]),
    ),
  });
  return readFileSync(join(out, CHUNK), "utf8");
}

// Records one browser page's hits on the built chunk: `zeroed` text ran no time, everything else ran once.
function browserRun(root: string, code: string, zeroed: readonly string[]): ReturnType<typeof convertBrowserRun> {
  const runDir = join(root, "run");
  mkdirSync(join(runDir, COVERAGE_LAYOUT.browser), { recursive: true });
  mkdirSync(join(runDir, COVERAGE_LAYOUT.sources), { recursive: true });
  writeFileSync(join(runDir, COVERAGE_LAYOUT.sources, sourceFileName(URL_OF_CHUNK)), code);
  const segments = flattenHits([
    {
      functionName: "",
      isBlockCoverage: true,
      ranges: [
        { startOffset: 0, endOffset: code.length, count: 1 },
        ...zeroed.map((text) => ({ startOffset: code.indexOf(text), endOffset: code.indexOf(text) + text.length, count: 0 })),
      ],
    },
  ]);
  writeFileSync(
    join(runDir, COVERAGE_LAYOUT.browser, "1-0.json"),
    JSON.stringify({ specs: ["tests/demo/main.ct.tsx"], lost: [], scripts: [{ url: URL_OF_CHUNK, source: sourceFileName(URL_OF_CHUNK), segments }] }),
  );
  return convertBrowserRun(runDir);
}

// The Node suite's universe for one source: vitest runs a .ts through oxc and maps it back, with nothing executed.
async function universe(root: string, rel: string, text: string): Promise<IstanbulMap> {
  const path = join(root, rel);
  const oxc = await transformWithOxc(text, path, { sourcemap: true });
  return istanbulOf(pathToFileURL(path).href, oxc.code, [{ startOffset: 0, endOffset: oxc.code.length, count: 0 }], {
    ...oxcMapSchema.parse(oxc.map),
    sources: [path],
  });
}

const FOLD = "packages/demo/src/fold.ts";
const TAKEN = '"taken-arm"';
const TWIN = '"twin-arm"';
const FOLD_TEXT = [
  "export function fold(run: number | undefined, moves: number): string {",
  "  const continues = run !== undefined && run === moves;",
  `  return continues ? ${TAKEN} : ${TWIN};`,
  "}",
  "",
].join("\n");

test("a conditional the bundler moved onto its inlined test lands on its source branch and its twin arm stays unexecuted", { tags: ["slow"] }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await plantedTree({ [FOLD]: FOLD_TEXT });
  const code = buildChunk(repoRoot, root, FOLD);
  const browser = await browserRun(root, code, [TWIN]);
  // Control: the build inlined `continues`, so its conditional no longer starts on the source's line 3.
  const built = Object.values(browser.map[join(root, FOLD)]?.branchMap ?? {}).find((branch) => branch.type === "cond-expr");
  expect(built?.loc.start.line).toBeLessThan(3);

  const merged = mergeCoverage(root, [
    { suite: "node", map: await universe(root, FOLD, FOLD_TEXT) },
    { suite: "ct", map: browser.map },
  ]);
  expect(merged.unexecuted).toEqual([{ file: FOLD, functions: [], branches: [{ type: "cond-expr", line: 3, arm: 1 }] }]);
  expect(merged.projections.ct).toMatchObject({ unmatchedFunctions: 0, unmatchedArms: 0, armMatchRate: 1 });
});

const LOAD = "packages/demo/src/load.ts";
const LOAD_TEXT = [
  "export async function load(): Promise<number> {",
  '  const lazy = await import("./lazy.ts");',
  '  const legacy = await import("./legacy.cjs");',
  "  return lazy.value + legacy.default.value;",
  "}",
  "",
].join("\n");
const SOURCES = {
  [LOAD]: LOAD_TEXT,
  "packages/demo/src/lazy.ts": "export const value = 1;\n",
  "packages/demo/src/legacy.cjs": "module.exports = { value: 2 };\n",
};

test("the arrows the build wraps around dynamic imports are no source function, so their hits are never unmatched", { tags: ["slow"] }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await plantedTree(SOURCES);
  const code = buildChunk(repoRoot, root, LOAD);
  // Control: the chunk holds both wrappers, the preload helper's and the CommonJS default read's.
  expect(code).toMatch(/__vitePreload\(\s*(?:async\s*)?\(/u);
  expect(code).toMatch(/\.then\(\s*\(\w+\)\s*=>\s*(?:\/\*[^*]*\*\/\s*)?__toESM\(/u);

  const browser = await browserRun(root, code, []);
  const merged = mergeCoverage(root, [
    { suite: "node", map: await universe(root, LOAD, LOAD_TEXT) },
    { suite: "ct", map: browser.map },
  ]);
  expect(merged.unexecuted).toEqual([]);
  expect(merged.projections.ct).toMatchObject({ unmatchedFunctions: 0, functionMatchRate: 1 });
  expect(merged.projections.ct?.matchedFunctions).toBeGreaterThan(0);
});
