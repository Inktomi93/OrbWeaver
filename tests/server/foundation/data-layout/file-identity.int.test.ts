import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { closeDb, createDb, localPath } from "@orb/db";
import { DB_FILE_NAME, fileDatabaseUrl, resolveDataLayout } from "@orb/server/foundation/data-layout";
import { expect, test } from "@orb/testkit/node";
import { sql } from "drizzle-orm";

for (const name of ["ordinary space", "capsule%20root", "literal% root #?", "unicode 雪"]) {
  test(`DataLayout opens the exact filesystem root: ${name}`, async ({ importStagingDir }) => {
    const root = join(importStagingDir, name);
    const layout = resolveDataLayout({ ["DATA_DIR"]: root });
    const path = join(layout.dbDir, DB_FILE_NAME);
    const db = await createDb(layout.databaseUrl);
    try {
      expect(localPath(layout.databaseUrl)).toBe(path);
      expect(await db.get(sql`PRAGMA database_list`)).toMatchObject({ file: path });
      expect(existsSync(path)).toBe(true);
    } finally {
      closeDb(db);
    }
  });
}

test("DataLayout preserves explicit URL inputs", () => {
  for (const url of ["file:./relative%20path.db", ":memory:", "libsql://example.invalid/db"]) {
    expect(resolveDataLayout({ ["DATABASE_URL"]: url }).databaseUrl).toBe(url);
  }
});

test("path producer encodes a relative filesystem name without changing its identity", async ({ importStagingDir }) => {
  const path = join(importStagingDir, "literal%20 #?", DB_FILE_NAME);
  const url = fileDatabaseUrl(relative(cwd(), path));
  expect(localPath(url)).toBe(path);
  const db = await createDb(url);
  try {
    expect(await db.get(sql`PRAGMA database_list`)).toMatchObject({ file: path });
  } finally {
    closeDb(db);
  }
});
