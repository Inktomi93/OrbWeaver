// The typecheck worlds the scans load: the package worlds and the test worlds `scripts/typecheck.ts` checks, one program
// each, and the merged program the reference graph loads. The merged program exists only in memory, built from the
// solution config's worlds; no tsconfig file holds it, and every other tool keeps the per-world split.
import { globSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";
import { z } from "zod";
import { loadWorld } from "../floor/testing/test-worlds.ts";

/** The package worlds, which hold every production file. */
export function packageWorlds(root: string): readonly string[] {
  return globSync("packages/*/tsconfig.json", { cwd: root }).sort();
}

// The router's emitted declarations inline every wire shape, so a world that imports `@orb/server` through them
// resolves each client read and write of a contract field to a declaration copy. The reference scans use source.
const SOURCE_BRIDGE: Readonly<Record<string, string>> = { "@orb/server": "packages/server/src/index.ts" };

/** A world's `paths` with {@link SOURCE_BRIDGE} added, every target absolute. A `paths` target is relative to the config. */
function bridgedPaths(root: string, config: string, parsed: ts.ParsedCommandLine): Record<string, string[]> {
  const base = dirname(join(root, config));
  const own = Object.entries(parsed.options.paths ?? {}).map(([name, targets]): [string, string[]] => [name, targets.map((target) => resolve(base, target))]);
  const bridge = Object.entries(SOURCE_BRIDGE).map(([name, target]): [string, string[]] => [name, [join(root, target)]]);
  return Object.fromEntries<string[]>([...own, ...bridge]);
}

/** One world's program as the reference scans load it: {@link loadWorld} with the source bridge. */
export function loadScanWorld(root: string, config: string): ts.ParsedCommandLine {
  const parsed = loadWorld(root, config);
  return { ...parsed, options: { ...parsed.options, paths: bridgedPaths(root, config, parsed) } };
}

// The part of a world's config the bridge rewrites; every other key is the compiler's and passes through.
const WorldConfig = z.looseObject({ compilerOptions: z.looseObject({}).optional() });

/** The text of a world's config with the source bridge written into its `paths`, for a compiler that reads files. */
export function bridgedConfigText(root: string, config: string): string {
  const path = join(root, config);
  const read = ts.readConfigFile(path, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`${config}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`);
  }
  const json = WorldConfig.parse(read.config);
  return JSON.stringify({ ...json, compilerOptions: { ...json.compilerOptions, paths: bridgedPaths(root, config, loadWorld(root, config)) } });
}

/** The solution config: its references are every typecheck world. */
const SOLUTION = "tsconfig.json";
// The part of the solution config the merged program reads; the rest of the file is the compiler's.
const SolutionConfig = z.looseObject({
  references: z
    .array(z.object({ path: z.string() }))
    .readonly()
    .optional(),
});
// Author-time rewrites with their own fixture trees, left out of the merged program as the per-world scans leave them out.
const UNMERGED: ReadonlySet<string> = new Set(["tooling/src/codemods/tsconfig.json"]);
// The merged program's option base: the browser world, so the DOM and Node libraries load together.
const MERGED_BASE = "tsconfig.world-browser.json";
/** Where the merged program's config sits in the in-memory file layer; nothing is written there. */
export const MERGED_CONFIG = "tsconfig.unwired-merged.json";

// The worlds the merged program unites: the solution config's references, the codemods world excluded.
function mergedWorlds(root: string): readonly string[] {
  const read = ts.readConfigFile(join(root, SOLUTION), ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`${SOLUTION}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`);
  }
  const { references = [] } = SolutionConfig.parse(read.config);
  return references
    .map(({ path }) => {
      const config = relative(root, resolve(root, path));
      return config.endsWith(".json") ? config : join(config, "tsconfig.json");
    })
    .filter((config) => !UNMERGED.has(config));
}

/** The merged program's config text: every file of every merged world, on the browser world's options with each world's
 *  `types` and `paths` added and the source bridge. A file two worlds name is one file. */
export function mergedConfigText(root: string): string {
  const worlds = mergedWorlds(root).map((config) => ({ config, parsed: loadWorld(root, config) }));
  const files = [...new Set(worlds.flatMap(({ parsed }) => parsed.fileNames))].sort();
  const types = [...new Set(worlds.flatMap(({ parsed }) => parsed.options.types ?? []))].sort();
  // The first world to map an alias keeps it, as the solution's order names the worlds.
  const paths: Record<string, string[]> = {};
  for (const { config, parsed } of worlds) {
    for (const [name, targets] of Object.entries(bridgedPaths(root, config, parsed))) {
      paths[name] ??= targets;
    }
  }
  return JSON.stringify({
    extends: join(root, MERGED_BASE),
    compilerOptions: { types, paths, allowJs: worlds.some(({ parsed }) => parsed.options.allowJs === true), noEmit: true },
    files,
  });
}

/** The host's realpath; every scan host sets it, so a workspace package keeps its source path. */
export const realpath = (path: string): string => ts.sys.realpath?.(path) ?? path;

export function createWorldProgram(root: string, config: string): ts.Program {
  const parsed = loadWorld(root, config);
  const host = ts.createCompilerHost(parsed.options);
  host.realpath = realpath;
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, host });
}

const PRODUCTION = /^packages\/[^/]+\/src\//u;

/** A file the product ships, by its repository-relative path. */
export function isProduction(relativePath: string): boolean {
  return PRODUCTION.test(relativePath);
}
