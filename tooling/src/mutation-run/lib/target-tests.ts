// Which tests a target runs against, found mechanically: the runner's own mirror rule, plus every test whose header names
// the file as `@subject`, which often sits in another tier's suite; only when both find nothing, a test that imports the
// file by relative path or through a package export that resolves to it. A component test never counts: the mutation
// run executes Vitest alone. A mirror test is not proof it reaches the file; a zero-killed run is how that shows.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { classifyTestFilename, SEMANTIC_CORPUS_RESOURCE } from "../../floor/testing/test-kinds.ts";
import { mirrorDir } from "./named-files.ts";

const TESTS_DIR = "tests";
const VITEST_FILE = /\.test\.ts$/u;
// `vitest.stryker.config.ts` drops the tooling project from a mutation run, so a tooling test can never kill a mutant.
const DROPPED_TREE = "tests/tooling/";
const SKIPPED_DIRS: ReadonlySet<string> = new Set(["node_modules"]);
const SUBJECT_LINE = /^[ \t]*(?:\/\/|\*)[ \t]*@subject[ \t]+(?<path>\S+)[ \t]*$/gmu;
const IMPORT_SPECIFIER = /(?:\bfrom\s+|\bimport\s*\(\s*|^import[ \t]+)"(?<specifier>[^"]+)"/gmu;
const PACKAGE_SPECIFIER = /^(?<name>@[^/]+\/[^/]+)(?<sub>\/.+)?$/u;

// How a target's tests were found. `named` is the list's own entry, which replaces the lookup.
const TEST_SOURCES = ["named", "mirror", "subject", "import"] as const;
type TestSource = (typeof TEST_SOURCES)[number];

export interface TargetTests {
  readonly sources: readonly TestSource[];
  readonly tests: readonly string[];
}

/** The Vitest files a mutation run can execute, checkout-relative with `/` separators, each read at most once. */
export interface TestCorpus {
  readonly files: readonly string[];
  readonly text: (file: string) => string;
}

interface PackageManifest {
  readonly name?: string;
  readonly exports?: unknown;
}

function toPosix(path: string): string {
  return path.split(sep).join(posix.sep);
}

function walk(root: string, dir: string, found: string[]): void {
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = posix.join(dir, entry.name);
    if (entry.isDirectory() && !SKIPPED_DIRS.has(entry.name)) {
      walk(root, path, found);
    } else if (entry.isFile() && VITEST_FILE.test(entry.name)) {
      found.push(path);
    }
  }
}

function runnable(file: string): boolean {
  return !file.startsWith(DROPPED_TREE) && classifyTestFilename(file)?.definition.resource !== SEMANTIC_CORPUS_RESOURCE;
}

export function readTestCorpus(root: string): TestCorpus {
  const found: string[] = [];
  walk(root, TESTS_DIR, found);
  const texts = new Map<string, string>();
  return {
    files: found.filter(runnable).toSorted(),
    text: (file): string => {
      const cached = texts.get(file) ?? readFileSync(join(root, file), "utf8");
      texts.set(file, cached);
      return cached;
    },
  };
}

function exportTargets(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  return typeof value === "object" && value !== null ? Object.values(value).flatMap(exportTargets) : [];
}

// A bare specifier resolves through the named workspace package's `exports`, the only way a test may reach it. A name
// with no `packages/` directory, such as `@orb/testkit` or a registry dependency, resolves to nothing.
function packageResolver(root: string): (specifier: string) => readonly string[] {
  const manifests = new Map<string, PackageManifest | null>();
  const manifestOf = (dir: string): PackageManifest | null => {
    const path = join(root, dir, "package.json");
    const manifest = manifests.get(dir) ?? (existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as PackageManifest) : null);
    manifests.set(dir, manifest);
    return manifest;
  };
  return (specifier) => {
    const groups = PACKAGE_SPECIFIER.exec(specifier)?.groups;
    const name = groups?.["name"] ?? "";
    const dir = posix.join("packages", name.slice(name.indexOf("/") + 1));
    const manifest = groups === undefined ? null : manifestOf(dir);
    if (manifest?.name !== name || typeof manifest.exports !== "object" || manifest.exports === null) {
      return [];
    }
    const entry = (manifest.exports as Record<string, unknown>)[`.${groups?.["sub"] ?? ""}`];
    return exportTargets(entry).map((target) => posix.join(dir, target));
  };
}

function importerOf(file: string, root: string): (test: string, text: string) => boolean {
  const resolvePackage = packageResolver(root);
  return (test, text) =>
    [...text.matchAll(IMPORT_SPECIFIER)].some(({ groups }) => {
      const specifier = groups?.["specifier"] ?? "";
      if (specifier.startsWith(".")) {
        return toPosix(relative(root, resolve(root, dirname(test), specifier))) === file;
      }
      return resolvePackage(specifier).includes(file);
    });
}

function namesSubject(text: string, file: string): boolean {
  return [...text.matchAll(SUBJECT_LINE)].some(({ groups }) => groups?.["path"] === file);
}

/** The tests the lookup finds for a checkout-relative `file`, sorted, or `null` when no step finds one. */
export function findTargetTests(file: string, corpus: TestCorpus, root: string): TargetTests | null {
  const mirror = mirrorDir(file);
  const mirrored = new Set(mirror === null ? [] : corpus.files.filter((test) => test.startsWith(`${toPosix(mirror)}/`)));
  const subjects = corpus.files.filter((test) => !mirrored.has(test) && namesSubject(corpus.text(test), file));
  const sources: TestSource[] = [...(mirrored.size > 0 ? ["mirror" as const] : []), ...(subjects.length > 0 ? ["subject" as const] : [])];
  if (sources.length > 0) {
    return { sources, tests: [...mirrored, ...subjects].toSorted() };
  }
  const imports = importerOf(file, root);
  const importers = corpus.files.filter((test) => imports(test, corpus.text(test)));
  return importers.length > 0 ? { sources: ["import"], tests: importers } : null;
}
