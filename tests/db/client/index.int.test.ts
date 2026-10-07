import { join } from "node:path";
import { closeDb, createDb } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import { sql } from "drizzle-orm";
import { expect, test } from "../../support/tool-fixtures.ts";

const CONCURRENT_OPERATIONS = 24;
const PRAGMA_READBACKS = [
  ["foreign_keys", "foreign_keys", 1],
  ["journal_mode", "journal_mode", "wal"],
  ["busy_timeout", "timeout", 5000],
  ["synchronous", "synchronous", 1],
  ["cache_size", "cache_size", -1_048_576],
  ["mmap_size", "mmap_size", 2_147_483_648],
  ["temp_store", "temp_store", 2],
] as const;

test("concurrent file operations retain the boot connection's complete PRAGMA configuration", async ({ scratch }) => {
  const db = await createDb(`file:${join(scratch, "pragmas.db")}`);
  try {
    const mappedBytes = (await db.get<Record<string, number>>(sql`PRAGMA mmap_size`))?.["mmap_size"];
    expect(mappedBytes).toBeGreaterThan(0);
    expect(mappedBytes).toBeLessThanOrEqual(2_147_483_648);
    const reads = await Promise.all(
      Array.from({ length: CONCURRENT_OPERATIONS }, () =>
        Promise.all(PRAGMA_READBACKS.map(async ([pragma, key]) => (await db.get<Record<string, string | number>>(sql.raw(`PRAGMA ${pragma}`)))?.[key])),
      ),
    );
    expect(reads).toEqual(
      Array.from({ length: CONCURRENT_OPERATIONS }, () => PRAGMA_READBACKS.map(([pragma, , value]) => (pragma === "mmap_size" ? mappedBytes : value))),
    );
  } finally {
    closeDb(db);
  }
});

test("FK suspension and restoration apply to every concurrent borrower, and restored enforcement refuses orphan writes", async ({ scratch }) => {
  const db = await createDb(`file:${join(scratch, "foreign-keys.db")}`);
  try {
    await db.run(sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`);
    await db.run(sql`CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id))`);
    await db.run(sql`INSERT INTO parent (id) VALUES (1)`);
    await db.run(sql`INSERT INTO child (id, parent_id) VALUES (1, 1)`);
    await db.run(sql`PRAGMA foreign_keys = OFF`);
    const suspended = await Promise.all(Array.from({ length: CONCURRENT_OPERATIONS }, () => db.get<Record<string, number>>(sql`PRAGMA foreign_keys`)));
    expect(suspended.map((row) => row?.["foreign_keys"])).toEqual(Array.from({ length: CONCURRENT_OPERATIONS }, () => 0));
    await db.run(sql`PRAGMA foreign_keys = ON`);
    const rejected = await Promise.allSettled(
      Array.from({ length: CONCURRENT_OPERATIONS }, (_, index) => db.run(sql`INSERT INTO child (id, parent_id) VALUES (${index + 2}, 99)`)),
    );
    expect(rejected.map((result) => (result.status === "rejected" ? isConstraintViolation(result.reason)?.kind : "accepted"))).toEqual(
      Array.from({ length: CONCURRENT_OPERATIONS }, () => "foreign-key"),
    );
    expect(await db.all<Record<string, number>>(sql`SELECT id FROM child ORDER BY id`)).toEqual([{ id: 1 }]);
  } finally {
    closeDb(db);
  }
});
