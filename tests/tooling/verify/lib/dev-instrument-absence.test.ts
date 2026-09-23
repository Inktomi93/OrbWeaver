// The DEV-only instrument judgment on planted graphs and chunk source lists. The declared roots are
// classified two-sided against the entry's `import.meta.env.DEV` branch. The dev-only set is what only those
// roots reach. A chunk carrying any member reds, including after a planted static import from production
// code, and every blind input refuses instead of passing. The last case reads the real `main.tsx`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DevInstrumentVerdict, ModuleValueGraph } from "../../../../tooling/src/verify/contract/dev-instrument-absence.ts";
import {
  chunkSources,
  DEV_ONLY_INSTRUMENTS,
  devBranchImports,
  isFacadeChunk,
  judgeDevInstruments,
  resolveSpecifier,
  valueGraphFromCruise,
} from "../../../../tooling/src/verify/lib/dev-instrument-absence.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ENTRY = "packages/client/src/main.tsx";
const ROOT = "packages/client/src/agent-handles/index.ts";
const ONLY_VIA_ROOT = "packages/client/src/agent-nav/index.ts";
/** Loaded in the DEV branch AND imported by production code: production-owned, allowed to ship. */
const SECTIONS = "packages/client/src/compose/config-sections.ts";
const SHARED = "packages/client/src/lib/shared.ts";
const APP = "packages/client/src/app.tsx";
const LAZY_APP = "packages/client/src/compose/authed-app.tsx";
const CHUNK = "packages/client/dist/assets/index-abc.js";
const LAZY = "packages/client/dist/assets/authed-app-def.js";

/** entry → app → shared, app ⇢ lazy app → sections; entry ⇢ root + sections (the DEV branch); root →
 *  shared + only-via-root. */
const GRAPH: ModuleValueGraph = new Map([
  [ENTRY, [APP, ROOT, SECTIONS]],
  [APP, [SHARED, LAZY_APP]],
  [LAZY_APP, [SECTIONS]],
  [SECTIONS, []],
  [ROOT, [SHARED, ONLY_VIA_ROOT]],
  [ONLY_VIA_ROOT, []],
  [SHARED, []],
]);
const DEV_BRANCH = [ROOT, SECTIONS];
const CLEAN_BUILD = new Map([
  [CHUNK, [ENTRY, APP, SHARED]],
  [LAZY, [LAZY_APP, SECTIONS]],
]);

function judge(
  chunks: ReadonlyMap<string, readonly string[]>,
  graph: ModuleValueGraph = GRAPH,
  roots: readonly string[] = [ROOT],
  devBranch: readonly string[] = DEV_BRANCH,
): DevInstrumentVerdict {
  return judgeDevInstruments({ entry: ENTRY, roots, devBranch, graph, chunks, unmappedCode: [] });
}

test("the DEV branch's dynamic imports are collected; an import() outside the branch is not", () => {
  const source = [
    'import("./outside.ts");',
    "if (import.meta.env.DEV) {",
    '  import("./lib/tracer.ts").then(() => undefined);',
    '  void import("./agent-handles/index.ts");',
    "}",
    "if (import.meta.env.PROD) {",
    '  import("./prod-only.ts");',
    "}",
  ].join("\n");
  expect(devBranchImports(source)).toEqual(["./lib/tracer.ts", "./agent-handles/index.ts"]);
  expect(resolveSpecifier(ENTRY, "./lib/tracer.ts")).toBe("packages/client/src/lib/tracer.ts");
});

test("a clean build passes; the dev-only set is the roots plus what only they reach, never a production-owned DEV import", () => {
  const verdict = judge(CLEAN_BUILD);
  expect(verdict.unmeasurable).toBeNull();
  expect(verdict.leaks).toEqual([]);
  expect(verdict.devOnly).toEqual([ROOT, ONLY_VIA_ROOT]);
});

test("a production path that statically imports a root reds, in the boot chunk or a lazy one", () => {
  const planted: ModuleValueGraph = new Map([...GRAPH, [APP, [SHARED, LAZY_APP, ROOT]]]);
  const verdict = judge(new Map([...CLEAN_BUILD, [CHUNK, [ENTRY, APP, SHARED, ROOT, ONLY_VIA_ROOT]]]), planted);
  expect(verdict.leaks).toEqual([
    { chunk: CHUNK, module: ROOT },
    { chunk: CHUNK, module: ONLY_VIA_ROOT },
  ]);
  const lazy = judge(new Map([...CLEAN_BUILD, [LAZY, [LAZY_APP, SECTIONS, ONLY_VIA_ROOT]]]));
  expect(lazy.leaks).toEqual([{ chunk: LAZY, module: ONLY_VIA_ROOT }]);
});

test("every blind or unclassified input refuses rather than passing", () => {
  const tracer = "packages/client/src/lib/tracer.ts";
  expect(judge(CLEAN_BUILD, GRAPH, [ROOT], []).unmeasurable).toContain("no import() inside");
  expect(judge(CLEAN_BUILD, GRAPH, [ROOT, tracer]).unmeasurable).toContain(`declared DEV-only instrument(s) ${tracer} are not imported inside the DEV branch`);
  expect(judge(CLEAN_BUILD, new Map([[APP, []]])).unmeasurable).toContain(`the source graph has no module for ${ENTRY}, ${ROOT}, ${SECTIONS}`);
  const withTracer: ModuleValueGraph = new Map([...GRAPH, [ENTRY, [APP, ROOT, SECTIONS, tracer]], [tracer, []]]);
  expect(judge(CLEAN_BUILD, withTracer, [ROOT], [ROOT, SECTIONS, tracer]).unmeasurable).toContain(
    `DEV-branch import(s) ${tracer} are neither declared in DEV_ONLY_INSTRUMENTS nor reached by production code`,
  );
  expect(judge(new Map([[CHUNK, []]])).unmeasurable).toContain("no chunk sourcemap named any source module");
  expect(
    judgeDevInstruments({ entry: ENTRY, roots: [ROOT], devBranch: DEV_BRANCH, graph: GRAPH, chunks: CLEAN_BUILD, unmappedCode: [LAZY] }).unmeasurable,
  ).toContain(`chunk(s) ${LAZY} carry code but have no sourcemap`);
  expect(judge(new Map([[CHUNK, [APP]]])).unmeasurable).toContain(`no chunk sourcemap names the entry ${ENTRY}`);
});

test("a chunk of only imports and re-exports is a facade; one with any other statement is not", () => {
  expect(isFacadeChunk('import{hr as e}from"./index-abc.js";export{e as Mermaid};')).toBe(true);
  expect(isFacadeChunk('import{hr as e}from"./index-abc.js";globalThis.__orb=e;export{e as Mermaid};')).toBe(false);
});

test("sourcemap sources resolve against the map's directory; virtual and out-of-repository entries drop", () => {
  const map = { version: 3, sources: ["../../src/main.tsx", "../../../ui/src/button.tsx", "\0vite/preload-helper", "../../../../../../outside.js"] };
  expect(chunkSources(map, "packages/client/dist/assets/index-abc.js.map")).toEqual(["packages/client/src/main.tsx", "packages/ui/src/button.tsx"]);
});

test("the cruise reader drops erased and unresolvable edges and refuses an unreadable shape", () => {
  const graph = valueGraphFromCruise({
    modules: [
      {
        source: ENTRY,
        dependencies: [
          { resolved: APP, dependencyTypes: ["local", "import"] },
          { resolved: "packages/client/src/types.ts", dependencyTypes: ["local", "type-only"] },
          { resolved: "fs", dependencyTypes: ["core"], coreModule: true },
          { resolved: "missing", dependencyTypes: ["unknown"], couldNotResolve: true },
        ],
      },
    ],
  });
  expect(graph.get(ENTRY)).toEqual([APP]);
  expect(() => valueGraphFromCruise({ summary: {} })).toThrow("modules is not an array");
});

test("the real main.tsx imports every declared DEV-only instrument inside its DEV branch", ({ repoRoot }) => {
  const devBranch = devBranchImports(readFileSync(join(repoRoot, ENTRY), "utf8")).map((specifier) => resolveSpecifier(ENTRY, specifier));
  expect(devBranch).toEqual(["packages/client/src/lib/long-task-tracer.ts", SECTIONS, ROOT]);
  expect(DEV_ONLY_INSTRUMENTS.every((root) => devBranch.includes(root))).toBe(true);
});
