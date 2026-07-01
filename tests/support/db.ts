// tests/support/db — freshDb (core/Spine-Testing.md §2): a libSQL `:memory:` db per call for the `.int` lane.
// freshDb PUSHES the LIVE schema (it diffs `@orb/db/schema` against an empty snapshot via drizzle-kit's
// programmatic API and applies the resulting CREATE statements over the real createDb handle), so a slice
// test always runs against the current schema regardless of whether `0000_baseline.sql` has been
// regenerated yet — fast + drift-proof for per-table tests. The committed baseline + the `runMigrations`
// FK-dance + `assertReferentialIntegrity`'s throw path are covered by `tests/db/client.int.test.ts`, and
// the committed baseline ↔ schema equivalence by `tests/tooling/schema-baseline-parity.int.test.ts`.

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
