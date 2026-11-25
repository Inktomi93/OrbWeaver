// The typecheck worlds the scans load: the package worlds and the test worlds `scripts/typecheck.ts` checks, one program
// each, and the merged program the reference graph loads. The merged program exists only in memory, built from the
// solution config's worlds; no tsconfig file holds it, and every other tool keeps the per-world split.
// Every tsconfig is read through the TypeScript 7.1 API session the caller already runs (WorldConfigs), so the unwired
// tool loads no second compiler: the floor's test-worlds module reads configs on TypeScript 6 for the lint split alone.
import { globSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { API, ParsedCommandLine } from "@typescript/native/sync";
import { z } from "zod";

/** The package worlds, which hold every production file. */
export function packageWorlds(root: string): readonly string[] {
  return globSync("packages/*/tsconfig.json", { cwd: root }).sort();
}

/** A world's tsconfig as the compiler parses it, resolved through `extends`. */
type ParsedWorld = ParsedCommandLine;

// The in-memory config and file a `types` probe runs in (WorldConfigs.typeFiles); nothing is written.
const TYPES_PROBE_CONFIG = "tsconfig.unwired-types-probe.json";
const TYPES_PROBE_FILE = "unwired-types-probe.ts";

/** What the world loader reads from tsconfig files, answered by one TypeScript 7.1 API session and remembered for its
 *  life. The session is the caller's: a reader starts no compiler of its own, so a run's compiler processes stay the
 *  ones its worlds start. */
export class WorldConfigs {
  readonly root: string;
  readonly #api: API;
  readonly #json = new Map<string>();
  readonly #parsed = new Map<string, ParsedWorld>();
  readonly #types = new Map<string, ReadonlyMap<string, string | undefined>>();

  constructor(api: API, root: string) {
    this.#api = api;
    this.root = root;
  }

  /** A tsconfig file's own JSON, comments allowed, with nothing resolved through `extends`. */
  json(config: string): unknown {
    if (!this.#json.has(config)) {
      const read = this.#api.readConfigFile(join(this.root, config));
      if (read.error !== undefined) {
        throw new Error(`${config}: ${read.error.text}`);
      }
      this.#json.set(config, read.config);
    }
    return this.#json.get(config);
  }

  /** One world's parsed tsconfig: its files, and its options as the compiler resolves them through `extends`. */
  parse(config: string): ParsedWorld {
    let parsed = this.#parsed.get(config);
    if (parsed === undefined) {
      // a config the compiler cannot read or parse stops here, named, as the one the compiler would refuse
      this.json(config);
      parsed = this.#api.parseConfigFile(join(this.root, config));
      this.#parsed.set(config, parsed);
    }
    return parsed;
  }

  /** The file each `types` entry in `names` of a world resolves to when the world's options resolve it from `directory`,
   *  or undefined for an entry that world cannot resolve. The compiler answers a resolution only for a file its program
   *  holds, so the entries are the `/// <reference types>` lines of a one-file program on the world's options, sited in
   *  `directory`. */
  typeFiles(config: string, directory: string, names: readonly string[]): ReadonlyMap<string, string | undefined> {
    const key = `${config}\n${directory}`;
    let found = this.#types.get(key);
    if (found === undefined) {
      const probeConfig = join(directory, TYPES_PROBE_CONFIG);
      const probeFile = join(directory, TYPES_PROBE_FILE);
      const files = {
        [probeConfig]: JSON.stringify({
          extends: join(this.root, config),
          compilerOptions: { types: [], noLib: true },
          files: [probeFile],
          include: [],
        }),
        [probeFile]: names.map((name) => `/// <reference types=${JSON.stringify(name)} />`).join("\n"),
      };
      using snapshot = this.#api.createSnapshot({ openProjects: [probeConfig], fileSystem: { kind: "layer", files } });
      const project = snapshot.getConfiguredProject(probeConfig);
      const source = project?.program.getSourceFile(probeFile);
      if (project === undefined || source === undefined) {
        throw new Error(`${config}: the TypeScript 7.1 API loaded no program to resolve its types from ${directory}`);
      }
      found = new Map(
        source.typeReferenceDirectives.map((directive) => [
          directive.fileName,
          project.program.getResolvedTypeReferenceDirectiveFromTypeReferenceDirective(directive, probeFile)?.resolvedFileName,
        ]),
      );
      this.#types.set(key, found);
    }
    return found;
  }
}

// The router's emitted declarations inline every wire shape, so a world that imports `@orb/server` through them
// resolves each client read and write of a contract field to a declaration copy. The reference scans use source.
const SOURCE_BRIDGE: Readonly<Record<string, string>> = { "@orb/server": "packages/server/src/index.ts" };

/** A world's `paths` with {@link SOURCE_BRIDGE} added, every target absolute. A `paths` target is relative to the config. */
function bridgedPaths(root: string, config: string, parsed: ParsedWorld): Record<string, string[]> {
  const base = dirname(join(root, config));
  const own = Object.entries(parsed.options.paths ?? {}).map(([name, targets]): [string, string[]] => [name, targets.map((target) => resolve(base, target))]);
  const bridge = Object.entries(SOURCE_BRIDGE).map(([name, target]): [string, string[]] => [name, [join(root, target)]]);
  return Object.fromEntries<string[]>([...own, ...bridge]);
}

// The part of a world's config the bridge rewrites; every other key is the compiler's and passes through.
const WorldConfig = z.looseObject({ compilerOptions: z.looseObject({}).optional() });

/** The text of a world's config with the source bridge written into its `paths`, for a compiler that reads files. */
export function bridgedConfigText(configs: WorldConfigs, config: string): string {
  const json = WorldConfig.parse(configs.json(config));
  return JSON.stringify({ ...json, compilerOptions: { ...json.compilerOptions, paths: bridgedPaths(configs.root, config, configs.parse(config)) } });
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
export function programsApart(configs: WorldConfigs): readonly string[] {
  return solutionWorlds(configs).filter((config) => {
    const reason = WORLDS_APART[config];
    return reason !== undefined && APART_POLICY[reason].ownProgram;
  });
}
// The merged program's option base: the browser world, so the DOM and Node libraries load together.
const MERGED_BASE = "tsconfig.world-browser.json";
/** Where the merged program's config sits in the in-memory file layer; nothing is written there. */
export const MERGED_CONFIG = "tsconfig.unwired-merged.json";

// The solution config's references: every typecheck world.
function solutionWorlds(configs: WorldConfigs): readonly string[] {
  const { references = [] } = SolutionConfig.parse(configs.json(SOLUTION));
  return references.map(({ path }) => {
    const config = relative(configs.root, resolve(configs.root, path));
    return config.endsWith(".json") ? config : join(config, "tsconfig.json");
  });
}

/** The worlds the merged program unites: every solution world {@link WORLDS_APART} does not name. */
export const mergedWorlds = (configs: WorldConfigs): readonly string[] => solutionWorlds(configs).filter((config) => WORLDS_APART[config] === undefined);

interface LoadedWorld {
  readonly config: string;
  readonly parsed: ParsedWorld;
}

const loadMergedWorlds = (configs: WorldConfigs): readonly LoadedWorld[] => mergedWorlds(configs).map((config) => ({ config, parsed: configs.parse(config) }));

// Each world's `types` entries resolved as tsc resolves them for that world, from the world's own folder. An entry that
// resolves to the same file from the merged config's root stays a `types` entry, so the program loads its package as
// the world does, as an external library with every file its index reaches by `/// <reference path>`; a package loaded
// as a root file is the tree's own by the program's answer. The merged config sits at the root, where an entry only a
// package's node_modules links (the showcase author worlds' plugin SDK) resolves to nothing, so the merged program loads
// each such resolved file as a root file instead. An entry the world itself cannot resolve stays a `types` entry, so the
// merged program reports the same missing type the world does.
function worldTypes(configs: WorldConfigs, worlds: readonly LoadedWorld[]): { readonly files: readonly string[]; readonly entries: readonly string[] } {
  const files = new Set<string>();
  const entries = new Set<string>();
  for (const { config, parsed } of worlds) {
    const names = parsed.options.types ?? [];
    if (names.length > 0) {
      const own = configs.typeFiles(config, dirname(join(configs.root, config)), names);
      // the merged config sits at the root
      const atRoot = configs.typeFiles(config, configs.root, names);
      for (const name of names) {
        const found = own.get(name);
        if (found === undefined || atRoot.get(name) === found) {
          entries.add(name);
        } else {
          files.add(found);
        }
      }
    }
  }
  return { files: [...files].sort(), entries: [...entries].sort() };
}

// The merged program's options on the browser world's: every world's `types` (worldTypes) and `allowJs`, over `files`
// with `paths`.
function mergedText(configs: WorldConfigs, worlds: readonly LoadedWorld[], files: readonly string[], paths: Readonly<Record<string, string[]>>): string {
  const types = worldTypes(configs, worlds);
  return JSON.stringify({
    extends: join(configs.root, MERGED_BASE),
    // allowJs is written only when a world sets it, so the merged options set nothing a world leaves to its default
    compilerOptions: {
      types: types.entries,
      paths,
      ...(worlds.some(({ parsed }) => parsed.options.allowJs === true) ? { allowJs: true } : {}),
      noEmit: true,
    },
    files: [...new Set([...files, ...types.files])].sort(),
  });
}

/** The merged program's config text: every file of every merged world, on the browser world's options with each world's
 *  `types` and `paths` added and the source bridge. A file two worlds name is one file. */
export function mergedConfigText(configs: WorldConfigs): string {
  const worlds = loadMergedWorlds(configs);
  const files = [...new Set(worlds.flatMap(({ parsed }) => parsed.fileNames))].sort();
  // The first world to map an alias keeps it, as the solution's order names the worlds.
  const paths: Record<string, string[]> = {};
  for (const { config, parsed } of worlds) {
    for (const [name, targets] of Object.entries(bridgedPaths(configs.root, config, parsed))) {
      paths[name] ??= targets;
    }
  }
  return mergedText(configs, worlds, files, paths);
}

/** One world's files and bridged `paths` on the merged program's options: an error the merged program brings to the
 *  world shows here when the merged options bring it, and not when another world's files or aliases do. */
export function mergedOptionsConfigText(configs: WorldConfigs, config: string): string {
  const own = configs.parse(config);
  return mergedText(configs, loadMergedWorlds(configs), own.fileNames, bridgedPaths(configs.root, config, own));
}

// A world loads the DOM library when its `lib` names one, or names none and so takes the target's default set, which holds it.
const DOM_LIB = /^lib\.dom\./u;

/** The repository-relative files the merged program's worlds name whose own world loads the DOM library. The merged
 *  program loads every library for every file, so whether a call is a browser's request is read from here. */
export function browserFiles(configs: WorldConfigs): ReadonlySet<string> {
  const files = new Set<string>();
  for (const config of mergedWorlds(configs)) {
    const parsed = configs.parse(config);
    if (parsed.options.lib?.some((name) => DOM_LIB.test(name)) ?? true) {
      for (const file of parsed.fileNames) {
        files.add(relative(configs.root, file));
      }
    }
  }
  return files;
}

const PRODUCTION = /^packages\/[^/]+\/src\//u;

/** A file the product ships, by its repository-relative path. */
export function isProduction(relativePath: string): boolean {
  return PRODUCTION.test(relativePath);
}
