// A top-level drizzle schema MODULE and its name — the `db-structure` family's shared subject. `db-structure`
// requires every such module to be re-exported from the barrel, and `db-structure-producer-home` requires each
// one to be named for its producer domain; if the two disagreed on what counts as a schema module, a module one
// of them skips would escape both rules. Nested files and the barrel itself are not modules.
const SCHEMA_DIR = "packages/db/src/schema";
export const SCHEMA_BARREL = `${SCHEMA_DIR}/index.ts`;
const TS_EXTENSION = ".ts";

/** The module name of a repo-relative path, or undefined when the path is not a top-level schema module. */
export function topLevelSchemaModule(path: string): string | undefined {
  if (!(path.startsWith(`${SCHEMA_DIR}/`) && path.endsWith(TS_EXTENSION)) || path === SCHEMA_BARREL) {
    return;
  }
  const tail = path.slice(SCHEMA_DIR.length + 1, -TS_EXTENSION.length);
  return tail.includes("/") ? undefined : tail;
}
