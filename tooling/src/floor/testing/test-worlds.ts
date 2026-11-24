// The test worlds, each one typed program, and the reader of what a world's tsconfig names. The lint config, the
// whole-tree lint parts and the reference scans all read the list and the specs here, so a world's files are matched
// the same way by each. The order is a ruling: a file two worlds name belongs to the earlier world. Every tsconfig read
// goes through tsc's own parser here, so the reference graph and the lint split read a config identically.
import { join } from "node:path";
import ts from "typescript";

/** The test worlds, the node world first. */
export const TEST_WORLDS = ["tsconfig.node.json", "tsconfig.tests-dom.json", "tsconfig.tests-iso.json"] as const;

/** A world's tsconfig as tsc parses it. */
export type ParsedWorld = ts.ParsedCommandLine;

/** One world's parsed tsconfig, as tsc resolves it through `extends`. `host` overrides how the parse reads the disk. */
export function loadWorld(root: string, config: string, host: Partial<ts.ParseConfigHost> = {}): ParsedWorld {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(root, config),
    {},
    {
      ...ts.sys,
      ...host,
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

/** A tsconfig file's own JSON, comments allowed, with nothing resolved through `extends`. */
export function readConfigJson(root: string, config: string): unknown {
  const read = ts.readConfigFile(join(root, config), ts.sys.readFile);
  if (read.error !== undefined) {
    throw new Error(`${config}: ${ts.flattenDiagnosticMessageText(read.error.messageText, "\n")}`);
  }
  return read.config;
}

/** The file a world's `types` entry resolves to, as tsc resolves it from the world's own folder, or undefined when the
 *  world cannot resolve it. */
export function resolveWorldType(root: string, config: string, parsed: ParsedWorld, name: string): string | undefined {
  return ts.resolveTypeReferenceDirective(name, join(root, config), parsed.options, ts.sys).resolvedTypeReferenceDirective?.resolvedFileName;
}

interface WorldSpecs {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

// What tsc includes when a config and its bases name no `include`.
const DEFAULT_INCLUDE = ["**/*"];

/** A world's `include` and `exclude` specs as tsc resolves them: a list a base config holds arrives through `extends`,
 *  rebased on the world's own directory. The config's own text holds neither when it inherits them, so a reader of
 *  that text alone gets nothing. No file is enumerated. */
export function worldSpecs(root: string, config: string): WorldSpecs {
  // tsc writes the specs it resolved through `extends` back onto the parsed config's `raw`.
  const { include = DEFAULT_INCLUDE, exclude = [] } = loadWorld(root, config, { readDirectory: () => [] }).raw as Partial<WorldSpecs>;
  return { include, exclude };
}
