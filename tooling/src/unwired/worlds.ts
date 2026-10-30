// The typecheck worlds the scans load, one program each, the same set `scripts/typecheck.ts` checks. Worlds are
// never merged: server code under the DOM test options resolves different types and loses members.
import { globSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** The package worlds, which hold every production file. */
export function packageWorlds(root: string): readonly string[] {
  return globSync("packages/*/tsconfig.json", { cwd: root }).sort();
}

/** The test worlds: a use found only here is test-only. */
export const TEST_WORLDS = ["tsconfig.json", "tsconfig.tests-dom.json"] as const;

/** One world's program. `realpath` keeps a workspace package on its source path rather than its
 *  `node_modules` link, or every cross-package reference is lost. */
export function loadWorld(root: string, config: string): ts.ParsedCommandLine {
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
