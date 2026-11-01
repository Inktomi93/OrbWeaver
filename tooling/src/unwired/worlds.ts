// The typecheck worlds the scans load, one program each, the same set `scripts/typecheck.ts` checks. Worlds are
// never merged: server code under the DOM test options resolves different types and loses members.
import { globSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import ts from "typescript";

/** The package worlds, which hold every production file. */
export function packageWorlds(root: string): readonly string[] {
  return globSync("packages/*/tsconfig.json", { cwd: root }).sort();
}

/** The test worlds: a use found only here is test-only. */
export const TEST_WORLDS = ["tsconfig.node.json", "tsconfig.tests-dom.json"] as const;

/** One world's program. `realpath` keeps a workspace package on its source path rather than its
 *  `node_modules` link, or every cross-package reference is lost. */
function loadWorld(root: string, config: string): ts.ParsedCommandLine {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(root, config),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(`${config}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
      },
    },
  );
  if (parsed === undefined) {
    throw new Error(`${config}: no parsed configuration`);
  }
  return parsed;
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

/** The text of a world's config with the source bridge written into its `paths`, for a compiler that reads files. */
export function bridgedConfigText(root: string, config: string): string {
  const path = join(root, config);
  const read = ts.readConfigFile(path, ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`${config}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`);
  }
  const json = read.config as { readonly compilerOptions?: Readonly<Record<string, unknown>> };
  return JSON.stringify({ ...json, compilerOptions: { ...json.compilerOptions, paths: bridgedPaths(root, config, loadWorld(root, config)) } });
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
