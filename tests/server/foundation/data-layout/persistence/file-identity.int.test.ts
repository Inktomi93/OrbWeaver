// The data layout resolves the database file the SQLite connection actually opens (PRAGMA database_list).

import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { createDb, localPath } from "@orb/db";
import { DB_FILE_NAME, fileDatabaseUrl, resolveDataLayout } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node";
import { ownDb } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { DATABASE_URL_KEY } from "#server/foundation/data-layout/contract.ts";

for (const name of ["ordinary space", "capsule%20root", "literal% root #?", "unicode 雪"]) {
  test(`DataLayout opens the exact filesystem root: ${name}`, async ({ importStagingDir }) => {
    const root = join(importStagingDir, name);
    const layout = resolveDataLayout({ ["DATA_DIR"]: root });
    const path = join(layout.dbDir, DB_FILE_NAME);
    using opened = ownDb(await createDb(layout.databaseUrl));
    const db = opened.db;
    expect(localPath(layout.databaseUrl)).toBe(path);
    expect(await db.get(sql`PRAGMA database_list`)).toMatchObject({ file: path });
    expect(existsSync(path)).toBe(true);
  });
}

test("DataLayout preserves explicit URL inputs", () => {
  for (const url of ["file:./relative%20path.db", ":memory:", "libsql://example.invalid/db"]) {
    expect(resolveDataLayout({ [DATABASE_URL_KEY]: url }).databaseUrl).toBe(url);
  }
});

test("path producer encodes a relative filesystem name without changing its identity", async ({ importStagingDir }) => {
  const path = join(importStagingDir, "literal%20 #?", DB_FILE_NAME);
  const url = fileDatabaseUrl(relative(cwd(), path));
  expect(localPath(url)).toBe(path);
  using opened = ownDb(await createDb(url));
  const db = opened.db;
  expect(await db.get(sql`PRAGMA database_list`)).toMatchObject({ file: path });
});
