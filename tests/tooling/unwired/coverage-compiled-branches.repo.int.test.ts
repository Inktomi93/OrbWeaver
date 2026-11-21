// A browser branch hit from a component the client build compiles lands on the source branch it ran, and a branch arm no
// hit reached stays unexecuted: the planted component goes through packages/client/vite.config.ts itself.
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
import { mergeCoverage } from "../../../tooling/src/unwired/coverage-merge.ts";

const SOURCE = "packages/demo/src/badge.tsx";
const TWIN = '"twin-arm"';
// The defaulted prop and the ternary are the shapes the React Compiler re-emits: it lowers the default to a conditional
// and wraps the JSX in memo-cache checks, which are branches the source does not have.
const TEXT = [
  'export function Badge({ open, tone = "plain" }: { readonly open: boolean; readonly tone?: string }) {',
  `  const label = open ? "shown-arm" : ${TWIN};`,
  "  return <b data-tone={tone}>{label}</b>;",
  "}",
  "",
].join("\n");
const CHUNK = "badge.js";
const COMPILER_RUNTIME = "react/compiler-runtime";
// The map fields the converter reads, which oxc's map type leaves optional.
const oxcMapSchema = z.object({ version: z.number(), names: z.array(z.string()), mappings: z.string() });

// Builds the planted component the way the CT gallery builds it, with the coverage env set or cleared.
function buildChunk(repoRoot: string, root: string, coverage: boolean): string {
  const out = join(root, coverage ? "out-coverage" : "out-default");
  const inline = {
    configFile: join(repoRoot, "packages/client/vite.config.ts"),
    configLoader: "native",
    mode: "component-test",
    logLevel: "silent",
    cacheDir: join(root, "vite-cache"),
    build: {
      outDir: out,
      emptyOutDir: true,
      rolldownOptions: {
        input: join(root, SOURCE),
        // An application build drops an entry's exports, and with them the component.
        preserveEntrySignatures: "exports-only",
        external: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", COMPILER_RUNTIME],
        output: { entryFileNames: CHUNK },
      },
    },
  };
  execFileSync(process.execPath, ["--input-type=module", "-e", `import { build } from "vite"; await build(${JSON.stringify(inline)});`], {
    cwd: join(repoRoot, "packages/client"),
    env: inheritedProcessEnv(
      Object.fromEntries([
        [COVERAGE_DIR_ENV, coverage ? join(root, "run") : ""],
        ["NODE_ENV", "development"],
      ]),
    ),
  });
  return readFileSync(join(out, CHUNK), "utf8");
}

test("a compiled component's taken branches land on their source branches and its untaken twin arm stays unexecuted", { tags: ["slow"] }, async ({
  plantedTree,
  repoRoot,
}) => {
  const root = await plantedTree({ [SOURCE]: TEXT });
  const path = join(root, SOURCE);
  // Control: the shipped build compiles this component, so the coverage build below has a rewrite to undo.
  expect(buildChunk(repoRoot, root, false)).toContain(COMPILER_RUNTIME);

  const code = buildChunk(repoRoot, root, true);
  const twinAt = code.indexOf(TWIN);
  expect(twinAt).toBeGreaterThan(0);
  // One render with `open` set and `tone` omitted: every offset ran but the twin arm.
  const segments = flattenHits([
    {
      functionName: "",
      isBlockCoverage: true,
      ranges: [
        { startOffset: 0, endOffset: code.length, count: 1 },
        { startOffset: twinAt, endOffset: twinAt + TWIN.length, count: 0 },
      ],
    },
  ]);
  const url = "http://127.0.0.1/assets/badge.js";
  const runDir = join(root, "run");
  mkdirSync(join(runDir, COVERAGE_LAYOUT.browser), { recursive: true });
  mkdirSync(join(runDir, COVERAGE_LAYOUT.sources), { recursive: true });
  writeFileSync(join(runDir, COVERAGE_LAYOUT.sources, sourceFileName(url)), code);
  writeFileSync(
    join(runDir, COVERAGE_LAYOUT.browser, "1-0.json"),
    JSON.stringify({ specs: ["tests/demo/badge.ct.tsx"], lost: [], scripts: [{ url, source: sourceFileName(url), segments }] }),
  );
  const browser = await convertBrowserRun(runDir);

  // The Node suite's universe: vitest runs a .tsx through oxc and maps it back, with nothing executed.
  const oxc = await transformWithOxc(TEXT, path, { sourcemap: true, jsx: { runtime: "automatic" } });
  const node = await istanbulOf(pathToFileURL(path).href, oxc.code, [{ startOffset: 0, endOffset: oxc.code.length, count: 0 }], {
    ...oxcMapSchema.parse(oxc.map),
    sources: [path],
  });
  const merged = mergeCoverage(root, [
    { suite: "node", map: node },
    { suite: "ct", map: browser.map },
  ]);
  expect(merged.unexecuted).toEqual([{ file: SOURCE, functions: [], branches: [{ type: "cond-expr", line: 2, arm: 1 }] }]);
  expect(merged.projections.ct).toMatchObject({ unmatchedFunctions: 0, unmatchedArms: 0, functionMatchRate: 1, armMatchRate: 1 });
});
