// The test worlds, each one typed program, and the reader of what a world's tsconfig names. The lint config, the
// whole-tree lint parts and the reference scans all read the list and the specs here, so a world's files are matched
// the same way by each. The order is a ruling: a file two worlds name belongs to the earlier world.
import { join } from "node:path";
import ts from "typescript";

/** The test worlds, the node world first. */
export const TEST_WORLDS = ["tsconfig.node.json", "tsconfig.tests-dom.json", "tsconfig.tests-iso.json"] as const;

/** One world's parsed tsconfig, as tsc resolves it through `extends`. `host` overrides how the parse reads the disk. */
export function loadWorld(root: string, config: string, host: Partial<ts.ParseConfigHost> = {}): ts.ParsedCommandLine {
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
