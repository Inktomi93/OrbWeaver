// The judgment behind the boot-chunk stage's second question: do the client's DEV-only instruments stay out
// of EVERY production chunk, preloaded or lazy?
//
// `main.tsx` loads its dev instruments with dynamic imports inside `if (import.meta.env.DEV)` and relies on
// the bundler folding that constant to drop them. The byte ratchet cannot see a regression here: it weighs
// only the boot set, so a refactor that pulls one of these modules into a LAZY production chunk passes it.
//
// THE ROOTS ARE DECLARED AND CLASSIFIED TWO-SIDED. Not every import in the DEV branch is dev-only:
// `compose/config-sections.ts` is loaded there early for agent navigation, but it is production code that
// `compose/authed-app.tsx` imports statically, so it legitimately ships in a lazy chunk. No derivation can
// tell that apart from a planted leak (a planted static import makes a dev module production-reachable
// too), so the dev-only roots are a declaration, `DEV_ONLY_INSTRUMENTS`. Both directions are checked: a
// declared root that is not a DEV-branch import is a stale declaration, and a DEV-branch import that is
// neither declared nor reached by production code is unclassified. Each refuses rather than passes.
//
// THE DEV-ONLY SET is the declared roots plus every module reachable ONLY through them in the source
// value-import graph: reach(roots) minus what production reaches. Production starts at the entry without
// its DEV-branch edges and never crosses an edge INTO a root, so a planted import of a root from production
// code still leaves the root dev-only. A module production code also imports is not dev-only and may ship.
//
// THE SHIPPED SET IS READ FROM THE BUILD. Each emitted chunk's sourcemap `sources` names the modules the
// bundler put in it; a dev-only module there is a leak. Pure over its inputs; the graph spawn and the file
// reads live in `ops/dev-instrument-absence.ts`, and the build in `ops/boot-chunk-ratchet.ts`.
import { posix } from "node:path";
import { ts } from "ts-morph";
import type { DevInstrumentInputs, DevInstrumentLeak, DevInstrumentVerdict, ModuleValueGraph } from "../contract/dev-instrument-absence.ts";

/** The condition `main.tsx` gates every dev instrument behind; the bundler constant-folds it. */
const DEV_CONDITION = "import.meta.env.DEV";
/** The modules `main.tsx` loads under its DEV branch that must never ship, repo-relative. */
export const DEV_ONLY_INSTRUMENTS: readonly string[] = ["packages/client/src/lib/long-task-tracer.ts", "packages/client/src/agent-handles/index.ts"];
/** dependency-cruiser's marks for an import erased at compile time. */
const ERASED_EDGE_TYPES = new Set(["type-only", "type-import"]);

/** Specifiers of every `import("…")` inside an `if (import.meta.env.DEV)` then-branch of `source`. */
export function devBranchImports(source: string): readonly string[] {
  const file = ts.createSourceFile("main.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      if (specifier !== undefined && ts.isStringLiteralLike(specifier)) {
        found.push(specifier.text);
      }
    }
    ts.forEachChild(node, collect);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isIfStatement(node) && node.expression.getText(file) === DEV_CONDITION) {
      collect(node.thenStatement);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** A relative specifier resolved against the importing file, repo-relative. */
export function resolveSpecifier(importerRel: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(importerRel), specifier));
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("dependency-cruiser output does not have the expected object shape");
  }
  return value as Readonly<Record<string, unknown>>;
}

function list(value: unknown, what: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`dependency-cruiser output: ${what} is not an array`);
  }
  return value;
}

function valueEdge(value: unknown): string | undefined {
  const dependency = record(value);
  const types = list(dependency["dependencyTypes"], "dependencyTypes");
  const resolved = dependency["resolved"];
  if (typeof resolved !== "string" || dependency["couldNotResolve"] === true || dependency["coreModule"] === true) {
    return;
  }
  return types.some((type) => typeof type === "string" && ERASED_EDGE_TYPES.has(type)) ? undefined : resolved;
}

/** The value-import graph from dependency-cruiser's JSON reporter output. Throws on a shape it cannot read. */
export function valueGraphFromCruise(json: unknown): ModuleValueGraph {
  const graph = new Map<string, readonly string[]>();
  for (const value of list(record(json)["modules"], "modules")) {
    const module = record(value);
    const source = module["source"];
    if (typeof source !== "string") {
      throw new Error("dependency-cruiser output: a module has no source path");
    }
    graph.set(
      source,
      list(module["dependencies"], "dependencies").flatMap((dependency) => valueEdge(dependency) ?? []),
    );
  }
  return graph;
}

function reach(graph: ModuleValueGraph, starts: readonly string[], cut: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>();
  const stack = [...starts];
  for (let next = stack.pop(); next !== undefined; next = stack.pop()) {
    if (seen.has(next)) {
      continue;
    }
    seen.add(next);
    for (const target of graph.get(next) ?? []) {
      if (!cut.has(target)) {
        stack.push(target);
      }
    }
  }
  return seen;
}

/** A chunk sourcemap's `sources`, resolved against the map's own directory to repo-relative paths. Entries
 *  that are not files (a bundler virtual module, a path outside the repository) are dropped. */
export function chunkSources(mapJson: unknown, mapRel: string): readonly string[] {
  const sources = list(record(mapJson)["sources"], "sourcemap sources");
  return sources.flatMap((source) => {
    if (typeof source !== "string" || source.includes("\0")) {
      return [];
    }
    const resolved = resolveSpecifier(mapRel, source);
    return resolved.startsWith("../") ? [] : [resolved];
  });
}

/** Whether an emitted chunk is a pure facade: nothing but import and re-export statements, so it carries no
 *  module of its own and the bundler writes no sourcemap for it. */
export function isFacadeChunk(text: string): boolean {
  const file = ts.createSourceFile("chunk.js", text, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  return file.statements.every((statement) => ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement));
}

function blindReason(inputs: DevInstrumentInputs, sources: number, production: ReadonlySet<string>): string | null {
  const { entry, roots, devBranch, graph, chunks, unmappedCode } = inputs;
  if (unmappedCode.length > 0) {
    return `chunk(s) ${unmappedCode.join(", ")} carry code but have no sourcemap, so their modules cannot be read`;
  }
  if (devBranch.length === 0) {
    return `no import() inside an \`if (${DEV_CONDITION})\` branch of ${entry}, so there is no dev-only set to look for`;
  }
  const stale = roots.filter((root) => !devBranch.includes(root));
  if (stale.length > 0) {
    return `declared DEV-only instrument(s) ${stale.join(", ")} are not imported inside the DEV branch of ${entry}; update DEV_ONLY_INSTRUMENTS`;
  }
  const missing = [entry, ...devBranch].filter((module) => !graph.has(module));
  if (missing.length > 0) {
    return `the source graph has no module for ${missing.join(", ")}`;
  }
  const unclassified = devBranch.filter((module) => !(roots.includes(module) || production.has(module)));
  if (unclassified.length > 0) {
    return `DEV-branch import(s) ${unclassified.join(", ")} are neither declared in DEV_ONLY_INSTRUMENTS nor reached by production code; classify them`;
  }
  if (sources === 0) {
    return "no chunk sourcemap named any source module, so the shipped set cannot be read";
  }
  if (![...chunks.values()].some((names) => names.includes(entry))) {
    return `no chunk sourcemap names the entry ${entry}, so the sourcemap paths do not resolve to this repository`;
  }
  return null;
}

/** Judge the build against the dev-only set. Every blind input is `unmeasurable`, never a pass. */
export function judgeDevInstruments(inputs: DevInstrumentInputs): DevInstrumentVerdict {
  const { entry, roots, devBranch, graph, chunks } = inputs;
  const sources = [...chunks.values()].reduce((sum, names) => sum + names.length, 0);
  // Production starts at the entry WITHOUT its DEV-branch edges (the bundler folds them away) and never
  // crosses into a declared root, whoever imports it.
  const entryEdges = (graph.get(entry) ?? []).filter((module) => !devBranch.includes(module));
  const production = new Set([entry, ...reach(graph, entryEdges, new Set(roots))]);
  const unmeasurable = blindReason(inputs, sources, production);
  if (unmeasurable !== null) {
    return { roots, devOnly: [], chunks: chunks.size, sources, leaks: [], unmeasurable };
  }
  const devOnly = [...reach(graph, roots, new Set())].filter((module) => !production.has(module)).toSorted();
  const devOnlySet = new Set(devOnly);
  const leaks: DevInstrumentLeak[] = [...chunks]
    .toSorted(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([chunk, names]) => [...new Set(names)].filter((module) => devOnlySet.has(module)).map((module) => ({ chunk, module })));
  return { roots, devOnly, chunks: chunks.size, sources, leaks, unmeasurable: null };
}
