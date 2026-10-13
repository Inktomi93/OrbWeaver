// Native architecture rules start from implementation, world-helper and client test entries.
// Imports reached from those entries remain native graph subjects regardless of their directory.
// Client stories and specs enter the graph so they obey `client-compose-door-only`.
import { BROWSER_PACKAGES, HELPER_WORLD_DIRS, worldOf } from "./project-worlds.ts";

const BROWSER_PACKAGE_TEST_ROOTS = [...BROWSER_PACKAGES].flatMap((name) => [`tests/${name}`, `tests/legacy/${name}`]);

export const IMPORT_ENTRY_ROOTS: readonly string[] = ["packages", "tooling", ...Object.values(HELPER_WORLD_DIRS), ...BROWSER_PACKAGE_TEST_ROOTS];

function underRoot(path: string): boolean {
  return IMPORT_ENTRY_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}

export function isImportEntry(path: string): boolean {
  return underRoot(path) || worldOf(path) === "browser";
}

/** Native entries include browser-owned tests and helpers outside package mirrors without a second folder roster. */
export function selectImportEntries(authoredPaths: readonly string[]): readonly string[] {
  return [...IMPORT_ENTRY_ROOTS, ...authoredPaths.filter((path) => !underRoot(path) && isImportEntry(path))];
}
