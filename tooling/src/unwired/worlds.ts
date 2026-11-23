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
/** Why a typecheck world stays out of the merged program. */
const APART_REASONS = ["own-toolchain", "global-collision"] as const;
type ApartReason = (typeof APART_REASONS)[number];

/** Whether the reference graph walks a world of each reason as its own program, and why the merge cannot hold it. */
const APART_POLICY: Readonly<Record<ApartReason, { readonly ownProgram: boolean; readonly why: string }>> = {
  "own-toolchain": { ownProgram: false, why: "the codemods run on their own TypeScript, outside the product's reference graph" },
  // one program has one global scope: packages/plugin-sdk/shared.d.ts keeps each runtime's `orb` to its own realm
  "global-collision": { ownProgram: true, why: "it declares a global the merged program already declares with another shape" },
};

/** The worlds the merged program leaves out, each with its reason. */
export const WORLDS_APART: Readonly<Record<string, ApartReason>> = {
  "tooling/src/codemods/tsconfig.json": "own-toolchain",
  "packages/showcase-plugins/tsconfig.author-ui.json": "global-collision",
};

/** The worlds the reference graph walks as programs of their own beside the merged one. */
export function programsApart(root: string): readonly string[] {
  return solutionWorlds(root).filter((config) => {
    const reason = WORLDS_APART[config];
    return reason !== undefined && APART_POLICY[reason].ownProgram;
  });
}
// The merged program's option base: the browser world, so the DOM and Node libraries load together.
const MERGED_BASE = "tsconfig.world-browser.json";
/** Where the merged program's config sits in the in-memory file layer; nothing is written there. */
export const MERGED_CONFIG = "tsconfig.unwired-merged.json";

// The solution config's references: every typecheck world.
function solutionWorlds(root: string): readonly string[] {
  const read = ts.readConfigFile(join(root, SOLUTION), ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`${SOLUTION}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`);
  }
  const { references = [] } = SolutionConfig.parse(read.config);
  return references.map(({ path }) => {
    const config = relative(root, resolve(root, path));
    return config.endsWith(".json") ? config : join(config, "tsconfig.json");
  });
}

/** The worlds the merged program unites: every solution world {@link WORLDS_APART} does not name. */
export const mergedWorlds = (root: string): readonly string[] => solutionWorlds(root).filter((config) => WORLDS_APART[config] === undefined);

interface LoadedWorld {
  readonly config: string;
  readonly parsed: ts.ParsedCommandLine;
}

const loadMergedWorlds = (root: string): readonly LoadedWorld[] => mergedWorlds(root).map((config) => ({ config, parsed: loadWorld(root, config) }));

// Each world's `types` entries resolved as tsc resolves them for that world, from the world's own folder. The merged
// config sits at the root, where an entry only a package's node_modules links (the showcase author worlds' plugin SDK)
// resolves to nothing, so the merged program loads each resolved file as a root file instead. An entry the world itself
// cannot resolve stays a `types` entry, so the merged program reports the same missing type the world does.
function worldTypes(root: string, worlds: readonly LoadedWorld[]): { readonly files: readonly string[]; readonly unresolved: readonly string[] } {
  const files = new Set<string>();
  const unresolved = new Set<string>();
  for (const { config, parsed } of worlds) {
    for (const name of parsed.options.types ?? []) {
      const found = ts.resolveTypeReferenceDirective(name, join(root, config), parsed.options, ts.sys).resolvedTypeReferenceDirective?.resolvedFileName;
      if (found === undefined) {
        unresolved.add(name);
      } else {
        files.add(found);
      }
    }
  }
  return { files: [...files].sort(), unresolved: [...unresolved].sort() };
}

// The merged program's options on the browser world's: every world's `types` (worldTypes) and `allowJs`, over `files`
// with `paths`.
function mergedText(root: string, worlds: readonly LoadedWorld[], files: readonly string[], paths: Readonly<Record<string, string[]>>): string {
  const types = worldTypes(root, worlds);
  return JSON.stringify({
    extends: join(root, MERGED_BASE),
    // allowJs is written only when a world sets it, so the merged options set nothing a world leaves to its default
    compilerOptions: {
      types: types.unresolved,
      paths,
      ...(worlds.some(({ parsed }) => parsed.options.allowJs === true) ? { allowJs: true } : {}),
      noEmit: true,
    },
    files: [...new Set([...files, ...types.files])].sort(),
  });
}

/** The merged program's config text: every file of every merged world, on the browser world's options with each world's
 *  `types` and `paths` added and the source bridge. A file two worlds name is one file. */
export function mergedConfigText(root: string): string {
  const worlds = loadMergedWorlds(root);
  const files = [...new Set(worlds.flatMap(({ parsed }) => parsed.fileNames))].sort();
  // The first world to map an alias keeps it, as the solution's order names the worlds.
  const paths: Record<string, string[]> = {};
  for (const { config, parsed } of worlds) {
    for (const [name, targets] of Object.entries(bridgedPaths(root, config, parsed))) {
      paths[name] ??= targets;
    }
  }
  return mergedText(root, worlds, files, paths);
}

/** One world's files and bridged `paths` on the merged program's options: an error the merged program brings to the
 *  world shows here when the merged options bring it, and not when another world's files or aliases do. */
export function mergedOptionsConfigText(root: string, config: string): string {
  const own = loadWorld(root, config);
  return mergedText(root, loadMergedWorlds(root), own.fileNames, bridgedPaths(root, config, own));
}

// A world loads the DOM library when its `lib` names one, or names none and so takes the target's default set, which holds it.
const DOM_LIB = /^lib\.dom\./u;

/** The repository-relative files the merged program's worlds name whose own world loads the DOM library. The merged
 *  program loads every library for every file, so whether a call is a browser's request is read from here. */
export function browserFiles(root: string): ReadonlySet<string> {
  const files = new Set<string>();
  for (const config of mergedWorlds(root)) {
    const parsed = loadWorld(root, config);
    if (parsed.options.lib?.some((name) => DOM_LIB.test(name)) ?? true) {
      for (const file of parsed.fileNames) {
        files.add(relative(root, file));
      }
    }
  }
  return files;
}

// The host's realpath, so a workspace package keeps its source path.
const realpath = (path: string): string => ts.sys.realpath?.(path) ?? path;

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
