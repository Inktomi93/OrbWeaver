// A browser hit on a function the client build renamed lands on its own source function, not on the same-named twin
// whose name forced the rename: the planted modules go through packages/client/vite.config.ts itself.
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

// Both stores declare a module-level `migrate`, so one chunk holding both renames one of them; which one is the
// bundler's choice, so the case reads it from the built chunk.
const STORES = ["packages/demo/src/a-store.ts", "packages/demo/src/b-store.ts"] as const;
const ENTRY = "packages/demo/src/main.ts";
const MIGRATE = ["export function migrate(version: number): number {", "  return version + 1;", "}", ""].join("\n");
const SOURCES = {
  [STORES[0]]: MIGRATE,
  [STORES[1]]: MIGRATE,
  [ENTRY]: 'import { migrate as a } from "./a-store.ts";\nimport { migrate as b } from "./b-store.ts";\nexport const steps = [a, b];\n',
};
const CHUNK = "main.js";
// The map fields the converter reads, which oxc's map type leaves optional.
const oxcMapSchema = z.object({ version: z.number(), names: z.array(z.string()), mappings: z.string() });

// Builds the planted entry the way the CT gallery builds it under `pnpm unwired coverage`.
function buildChunk(repoRoot: string, root: string): string {
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
      rolldownOptions: { input: join(root, ENTRY), preserveEntrySignatures: "exports-only", output: { entryFileNames: CHUNK } },
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

// The Node suite's universe for one source: vitest runs a .ts through oxc and maps it back, with nothing executed.
async function universe(root: string, rel: string): Promise<IstanbulMap> {
  const path = join(root, rel);
  const oxc = await transformWithOxc(MIGRATE, path, { sourcemap: true });
  return istanbulOf(pathToFileURL(path).href, oxc.code, [{ startOffset: 0, endOffset: oxc.code.length, count: 0 }], {
    ...oxcMapSchema.parse(oxc.map),
    sources: [path],
  });
}

const functionNames = (map: IstanbulMap, path: string): readonly string[] => Object.values(map[path]?.fnMap ?? {}).map((fn) => fn.name);

test("a renamed function's hit lands on its own source function and its same-named twin stays unexecuted", { tags: ["slow"] }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await plantedTree(SOURCES);
  const code = buildChunk(repoRoot, root);
  // The twin keeps its name, so it is the chunk's one `function migrate(`; only the renamed copy ran.
  const twinAt = code.indexOf("function migrate(");
  expect(twinAt).toBeGreaterThan(0);
  const segments = flattenHits([
    {
      functionName: "",
      isBlockCoverage: true,
      ranges: [
        { startOffset: 0, endOffset: code.length, count: 1 },
        { startOffset: twinAt, endOffset: code.indexOf("}", twinAt) + 1, count: 0 },
      ],
    },
  ]);
  const url = "http://127.0.0.1/assets/main.js";
  const runDir = join(root, "run");
  mkdirSync(join(runDir, COVERAGE_LAYOUT.browser), { recursive: true });
  mkdirSync(join(runDir, COVERAGE_LAYOUT.sources), { recursive: true });
  writeFileSync(join(runDir, COVERAGE_LAYOUT.sources, sourceFileName(url)), code);
  writeFileSync(
    join(runDir, COVERAGE_LAYOUT.browser, "1-0.json"),
    JSON.stringify({ specs: ["tests/demo/stores.ct.tsx"], lost: [], scripts: [{ url, source: sourceFileName(url), segments }] }),
  );
  const browser = await convertBrowserRun(runDir);
  // Control: the build renamed one store's `migrate`, so its browser copy carries a name its source lacks.
  const names = STORES.map((rel) => functionNames(browser.map, join(root, rel)));
  expect(names.toSorted((a, b) => String(a).localeCompare(String(b)))).toEqual([["migrate"], ["migrate$1"]]);
  const twin = STORES.find((_, index) => names[index]?.[0] === "migrate");

  const merged = mergeCoverage(root, [
    { suite: "node", map: { ...(await universe(root, STORES[0])), ...(await universe(root, STORES[1])) } },
    { suite: "ct", map: browser.map },
  ]);
  expect(merged.unexecuted).toEqual([{ file: twin, functions: [{ name: "migrate", line: 1 }], branches: [] }]);
  expect(merged.projections.ct).toMatchObject({ unmatchedFunctions: 0, functionMatchRate: 1 });
});
