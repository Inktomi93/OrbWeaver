// The only way a run gets its population. Exact files, never a pattern: a whole-tree mutation run cannot be spelled.
// Tests default to the mirror directory, because a kit file reaches most of the suite through the server graph.
import { existsSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { UsageError } from "../../floor/cli/run-tool.ts";
import { looksLikeTestFilename } from "../../floor/testing/test-kinds.ts";

/** `,` too: Stryker's option lists are comma lists, so one inside a name would split it into two patterns. */
const PATTERN_CHARS = /[*?[\]{}!,]/u;
const SOURCE_FILE = /\.tsx?$/u;
const DECLARATION_FILE = /\.d\.ts$/u;
const PACKAGE_SOURCE = /^packages\/(?<name>[^/]+)\/src(?<dir>\/.*)?$/u;
const TESTS_FLAG = "--tests";

const USAGE = [
  "usage: pnpm test:mutation <file...> [--tests <test-file-or-glob...>]",
  "Mutates the named source files against the tests in the directory that mirrors each file.",
  "A survivor or NoCoverage mutant can be caught by a test outside that mirror, such as a .suite test: name it with --tests, which replaces the mirror.",
].join("\n");

export interface MutationPlan {
  readonly files: readonly string[];
  readonly tests: readonly string[];
}

function refusalFor(path: string, root: string): string | null {
  const fromRoot = relative(root, resolve(root, path));
  if (PATTERN_CHARS.test(path)) {
    return "is a pattern; name exact files";
  }
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    return "is outside this checkout";
  }
  if (statSync(resolve(root, path), { throwIfNoEntry: false })?.isFile() !== true) {
    return "is not a file";
  }
  if (!SOURCE_FILE.test(path) || DECLARATION_FILE.test(path)) {
    return "is not TypeScript source";
  }
  if (looksLikeTestFilename(path)) {
    return "is a test; name the source file it covers";
  }
  return PACKAGE_SOURCE.test(dirname(fromRoot)) ? null : "is not package source; the tooling suites cannot run in a sandbox";
}

function mirrorGlob(file: string, root: string): string | null {
  const groups = PACKAGE_SOURCE.exec(dirname(file))?.groups;
  if (groups === undefined) {
    return null;
  }
  const mirror = join("tests", groups["name"] ?? "", groups["dir"] ?? "");
  return existsSync(join(root, mirror)) ? join(mirror, "**", "*.test.ts") : null;
}

function mirrorGlobs(files: readonly string[], root: string): readonly string[] {
  const globs = files.map((file) => ({ file, glob: mirrorGlob(file, root) }));
  const unmirrored = globs.filter(({ glob }) => glob === null).map(({ file }) => file);
  if (unmirrored.length > 0) {
    throw new UsageError([`no test directory mirrors ${unmirrored.join(", ")}; name the tests with ${TESTS_FLAG}`, USAGE].join("\n"));
  }
  return [...new Set(globs.flatMap(({ glob }) => (glob === null ? [] : [glob])))];
}

/** The named files as checkout-relative paths and the tests to run them against, or a refusal naming each bad argument. */
export function planMutationRun(args: readonly string[], root: string): MutationPlan {
  const flag = args.indexOf(TESTS_FLAG);
  const named = flag === -1 ? args : args.slice(0, flag);
  const tests = flag === -1 ? [] : args.slice(flag + 1);
  if (named.length === 0 || (flag !== -1 && tests.length === 0)) {
    throw new UsageError(USAGE);
  }
  const refusals = named.flatMap((path) => {
    const refusal = refusalFor(path, root);
    return refusal === null ? [] : [`${path} ${refusal}`];
  });
  if (refusals.length > 0) {
    throw new UsageError([...refusals, USAGE].join("\n"));
  }
  const files = named.map((path) => relative(root, resolve(root, path)));
  return { files, tests: tests.length > 0 ? tests : mirrorGlobs(files, root) };
}
