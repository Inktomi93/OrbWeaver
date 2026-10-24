import { existsSync, statSync, utimesSync } from "node:fs";
import { join, relative } from "node:path";
import { cwd } from "node:process";
import { pathToFileURL } from "node:url";
import { backupBeforeMigrate, closeDb, createDb, detachWal, localPath, preCloseHousekeeping, pruneDbBackups } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { sql } from "drizzle-orm";

const VERSION = 1013;
const FILE_FORMS = ["absolute", "relative", "authority", "localhost", "raw-space", "query"] as const;

for (const form of FILE_FORMS) {
  test(`native file identity, inspection, backup and shutdown: ${form}`, async ({ importStagingDir }) => {
    const path = join(importStagingDir, form === "raw-space" ? "ordinary space" : "literal%20 space", "probe.db");
    const authority = pathToFileURL(path).href;
    const bareAbsolute = authority.replace("file://", "file:");
    const relativePath = relative(cwd(), path);
    const urls = {
      absolute: bareAbsolute,
      relative: `file:${relativePath.split("/").map(encodeURIComponent).join("/")}`,
      authority,
      localhost: authority.replace("file:///", "file://localhost/"),
      "raw-space": `file:${path}`,
      query: `${bareAbsolute}?tls=0`,
    } satisfies Record<(typeof FILE_FORMS)[number], string>;
    const url = urls[form];
    const expectedPath = form === "relative" ? relativePath : path;
    const db = await createDb(url);
    try {
      await db.run(sql.raw(`PRAGMA user_version = ${VERSION}`));
      expect(localPath(url)).toBe(expectedPath);
      expect(await db.get(sql`PRAGMA database_list`)).toMatchObject({ file: path });
      expect(existsSync(path)).toBe(true);
      const backups = join(importStagingDir, "backup%20 space");
      const backup = await backupBeforeMigrate(db, url, backups);
      expect(backup).toBeDefined();
      if (backup === undefined) {
        throw new Error("file backup missing");
      }
      const snapshot = await createDb(pathToFileURL(backup).href);
      try {
        expect(await snapshot.get(sql`PRAGMA user_version`)).toEqual({ ["user_version"]: VERSION });
      } finally {
        closeDb(snapshot);
      }
      utimesSync(backup, 1, 1);
      expect(await backupBeforeMigrate(db, url, backups)).toBe(backup);
      expect(statSync(backup).mtimeMs).toBe(1000);
      expect(pruneDbBackups(url, backups)).toEqual([]);
      expect(await detachWal(db)).toEqual({ sole: true });
    } finally {
      await preCloseHousekeeping(db);
    }
    expect(existsSync(`${path}-wal`)).toBe(false);
    const reopened = await createDb(url);
    try {
      expect(await reopened.get(sql`PRAGMA user_version`)).toEqual({ ["user_version"]: VERSION });
    } finally {
      closeDb(reopened);
    }
  });
}

test("bare relative paths retain their cwd-relative spelling", () => {
  expect(localPath("file:./data/a%20b.db")).toBe("./data/a b.db");
  expect(localPath("file:../data/a%2520b.db")).toBe("../data/a%20b.db");
  expect(localPath("file:relative.db")).toBe("relative.db");
});

test("memory and remote URLs have no filesystem lifecycle", async ({ importStagingDir }) => {
  for (const url of [":memory:", "libsql://example.invalid/db", "https://example.invalid/db"]) {
    expect(localPath(url)).toBeUndefined();
    expect(pruneDbBackups(url, importStagingDir)).toEqual([]);
  }
  const db = await createDb(":memory:");
  try {
    expect(await db.get(sql`PRAGMA journal_mode`)).toEqual({ ["journal_mode"]: "memory" });
    expect(await backupBeforeMigrate(db, ":memory:", importStagingDir)).toBeUndefined();
  } finally {
    await preCloseHousekeeping(db);
  }
});
