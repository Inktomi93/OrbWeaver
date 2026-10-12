// Native architecture rules start from implementation, world-helper and client test entries.
// Imports reached from those entries remain native graph subjects regardless of their directory.
// `tests/client` is an entry because stories and specs mount the client and must obey `client-compose-door-only`.
import { HELPER_WORLD_DIRS } from "./project-worlds.ts";

const CLIENT_TEST_ROOT = "tests/client";

export const IMPORT_ENTRY_ROOTS: readonly string[] = ["packages", "tooling", ...Object.values(HELPER_WORLD_DIRS), CLIENT_TEST_ROOT];

export function isImportEntry(path: string): boolean {
  return IMPORT_ENTRY_ROOTS.some((root) => path === root || path.startsWith(`${root}/`));
}
