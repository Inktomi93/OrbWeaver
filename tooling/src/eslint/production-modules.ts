// The production modules the test-authoring rules index, read once and parsed once however many rules index them.
// A rule takes its index as a thunk and builds it on its first file, so resolving a config for a file outside the
// rule's scope reads no production source.
import { globSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { posixPath } from "./syntax.ts";

const PRODUCTION_MODULES = "packages/*/src/**/*.{ts,tsx}";
const NOT_PRODUCTION = /\.(?:test|test-d|d)\.tsx?$/u;

/** One production module: its POSIX path from the root, its text, and its syntax tree, parsed on first use. */
export interface ProductionModule {
  readonly module: string;
  readonly text: string;
  readonly source: () => ts.SourceFile;
}

/** The value `make` returns, computed on the first call and kept. */
export function lazy<T>(make: () => T): () => T {
  let held: { readonly value: T } | undefined;
  return () => {
    held ??= { value: make() };
    return held.value;
  };
}

/** Every production `.ts` and `.tsx` module under `root`, in path order. A module path is POSIX on every OS. */
export function productionModules(root: string): readonly ProductionModule[] {
  return globSync(PRODUCTION_MODULES, { cwd: root })
    .map(posixPath)
    .sort()
    .filter((module) => !NOT_PRODUCTION.test(module))
    .map((module) => {
      const text = readFileSync(join(root, module), "utf8");
      return { module, text, source: lazy(() => ts.createSourceFile(module, text, ts.ScriptTarget.Latest, false)) };
    });
}
