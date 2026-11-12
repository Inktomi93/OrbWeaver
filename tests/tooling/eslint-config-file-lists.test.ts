// The `files` and `ignores` lists the ESLint config computes at load are POSIX and never empty on any OS. An empty
// `files` list stops the config from loading, and a `\` pattern matches no file, so on Windows either fault stops
// every rule or silently drops one.
import { join, posix, win32 } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import eslintConfig from "../../eslint.config.ts";
import { factsOf, listSlotSurfacePaths, listSlotSurfaces, loadSources, posixPath } from "../../tooling/src/eslint/index.ts";

const ROOT = join(import.meta.dirname, "../..");
const ENTRY_RULE = "orb/browser-support-entry";
const LIST_SURFACE_RULE = "orb/library-surface-row";
const PAGE_SCRIPT = "packages/client/src/entry.ts";
// Read once at import: the scan reads every client and ui source.
const LIST_SURFACES = listSlotSurfacePaths(ROOT);

interface PatternList {
  readonly at: string;
  readonly patterns: readonly string[];
}

const patternLists = (): readonly PatternList[] =>
  eslintConfig.flatMap((block, index) => [
    ...(block.files === undefined ? [] : [{ at: `block ${String(index)} files`, patterns: block.files.flat() }]),
    ...(block.ignores === undefined ? [] : [{ at: `block ${String(index)} ignores`, patterns: block.ignores }]),
  ]);

const filesOfRule = (rule: string): readonly string[] =>
  eslintConfig.flatMap((block) =>
    Object.entries(block.rules ?? {}).some(([id, setting]) => id === rule && setting === "error") ? (block.files ?? []).flat() : [],
  );

const surfacesOf = (inventory: ReturnType<typeof loadSources>): readonly string[] =>
  [...listSlotSurfaces(inventory.flatMap((source) => factsOf(source) ?? []))].sort();

test("every files and ignores list in the production config is non-empty and spelled with forward slashes", () => {
  const lists = patternLists();
  expect(lists.filter(({ patterns }) => patterns.length === 0).map(({ at }) => at)).toEqual([]);
  expect(lists.flatMap(({ at, patterns }) => patterns.filter((pattern) => pattern.includes(win32.sep)).map((pattern) => `${at}: ${pattern}`))).toEqual([]);
  // The two lists the config computes from the tree are among the lists judged above, as repository paths.
  expect(LIST_SURFACES.length).toBeGreaterThan(0);
  expect(filesOfRule(LIST_SURFACE_RULE)).toEqual(LIST_SURFACES);
  expect(filesOfRule(ENTRY_RULE)).toContain(PAGE_SCRIPT);
});

test("a source inventory spelled with Windows separators finds no list surface until its paths are POSIX", () => {
  const sources = loadSources(ROOT);
  // fs.globSync joins its results with the platform separator, so this is the inventory a Windows checkout reads.
  const windows = sources.map((source) => ({ ...source, path: source.path.replaceAll(posix.sep, win32.sep) }));
  expect(windows.some((source) => source.path.startsWith(`packages${win32.sep}client${win32.sep}`))).toBe(true);
  expect(surfacesOf(windows)).toEqual([]);
  const surfaces = surfacesOf(windows.map((source) => ({ ...source, path: posixPath(source.path) })));
  expect(surfaces.length).toBeGreaterThan(0);
  expect(surfaces).toEqual(LIST_SURFACES);
});
