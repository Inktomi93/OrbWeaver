// Native architecture rules start from implementation and world-helper entries, not test consumers.
// Imports reached from those entries remain native graph subjects regardless of their directory.
import { HELPER_WORLD_DIRS } from "./project-worlds.ts";

export const IMPORT_ENTRY_ROOTS: readonly string[] = ["packages", "tooling", ...Object.values(HELPER_WORLD_DIRS)];

export function isImportEntry(path: string): boolean {
  return IMPORT_ENTRY_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}
