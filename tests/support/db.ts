// tests/support/db — freshDb (spine/testing.md §2): a migrated libSQL `:memory:` db per call for the
// `.int` lane. There is no `0000_baseline` migration yet (it's generated once every Wave-1 table lands),
// so freshDb PUSHES the schema: it diffs the live `@orb/db/schema` against an empty snapshot via
// drizzle-kit's programmatic API and applies the resulting CREATE statements over the real createDb
// handle. This keeps tests independent of migration files (which lag the schema). When the baseline
// lands, this can switch to `runMigrations` with no test changes.

import type { Db } from "@orb/db";
import { createDb } from "@orb/db";
// biome-ignore lint/performance/noNamespaceImport: drizzle-kit's snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table.
import * as schema from "@orb/db/schema";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { sql } from "drizzle-orm";

/** A fresh in-memory db with the full schema applied (FK enforcement ON, via createDb). */
export async function freshDb(): Promise<Db> {
  const db = await createDb(":memory:");
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema as Record<string, unknown>);
  const statements = await generateSQLiteMigration(empty, current);
  for (const statement of statements) {
    // biome-ignore lint/performance/noAwaitInLoops: DDL must apply sequentially in emitted order on one connection — Promise.all would race CREATE statements and corrupt dependency order.
    await db.run(sql.raw(statement));
  }
  return db;
}
