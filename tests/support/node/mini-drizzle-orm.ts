// The drizzle-orm module the in-memory ts-morph projects spread: a write verb counts as drizzle's only when
// drizzle-orm declares it, so fixture clients import `Db` from here instead of declaring their own.
export const MINI_DRIZZLE_ORM_PATH = "node_modules/drizzle-orm/index.ts";

export const MINI_DRIZZLE_ORM_SOURCE = `
export declare class Builder {
  values(v: unknown): Builder;
  set(v: unknown): Builder;
  where(w: unknown): Builder;
  select(query: unknown): Builder;
  onConflictDoUpdate(c: unknown): Builder;
}
export declare class Db {
  insert(t: unknown): Builder;
  update(t: unknown): Builder;
  delete(t: unknown): Builder;
  select(shape?: unknown): { from(t: unknown): unknown[] };
  run(statement: unknown): unknown;
  execute(statement: unknown): unknown;
  batch(statements: readonly unknown[]): unknown;
}
`;

/** The file map to spread into a project's files. */
export const MINI_DRIZZLE_ORM_FILES: Readonly<Record<string, string>> = { [MINI_DRIZZLE_ORM_PATH]: MINI_DRIZZLE_ORM_SOURCE };
