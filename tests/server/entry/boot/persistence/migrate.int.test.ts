// Persistence: the boot migration step on a real file database. Its subject is what a boot leaves on disk: the
// pre-migration copy, the journal, the retained history and the rows. Pre-migration databases come from the shipped chain cut before a migration.
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Db } from "@orb/db";
import { backupBeforeMigrate, checkBaseline, closeDb, createDb, hasPendingMigrations, listBackupFiles, messageVariants, runMigrations } from "@orb/db";
import { isBackupFileName } from "@orb/db/backup-names";
import { DomainOperationError } from "@orb/kit/errors";
import { runBootMigrations } from "@orb/server/entry/boot";
import { expect, test } from "@orb/testkit/node";
import { createTestLogger, migrationsBeforeLatest, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedMessageRow } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

const DB_NAME = "orb.db";
const CONTENT = "committed-in-wal";

interface Layout {
  readonly path: string;
  readonly url: string;
  readonly backupDir: string;
  readonly dir: string;
}

function layoutIn(dir: string): Layout {
  const path = join(dir, DB_NAME);
  return { path, url: pathToFileURL(path).href, backupDir: join(dir, "backups"), dir };
}

function boot(db: Db, where: Layout, over: { readonly backupDir?: string } = {}): Promise<void> {
  return runBootMigrations({ db, logger: createTestLogger(), databaseUrl: where.url, backupDir: over.backupDir ?? where.backupDir });
}

const backupsIn = (dir: string): readonly string[] => (statSync(dir, { throwIfNoEntry: false }) === undefined ? [] : listBackupFiles(dir, DB_NAME));

/** A file database one migration behind the shipped chain, holding a message whose commit still sits in the WAL. */
async function previousChainDb(where: Layout, previous: string): Promise<Db> {
  const db = await createDb(where.url);
  await runMigrations(db, previous);
  await seedMessageRow(db, { content: CONTENT });
  expect(statSync(`${where.path}-wal`).size).toBeGreaterThan(0);
  return db;
}

const contents = async (db: Db): Promise<readonly string[]> =>
  (await db.select({ content: messageVariants.content }).from(messageVariants)).map((row) => row.content);

test("a fresh boot migrates to the shipped chain with a backup in the backup dir, and a boot with nothing pending takes none", async ({ importStagingDir }) => {
  const where = layoutIn(importStagingDir);
  const db = await createDb(where.url);
  try {
    await boot(db, where);
    expect((await checkBaseline(db, SHIPPED_MIGRATIONS)).status).toBe("current");
    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(false);
    expect(await db.get(sql`PRAGMA foreign_keys`)).toEqual({ ["foreign_keys"]: 1 });
    const first = backupsIn(where.backupDir);
    expect(first).toHaveLength(1);
    expect(backupsIn(where.dir)).toEqual([]);

    await boot(db, where);
    expect(backupsIn(where.backupDir)).toEqual(first);
    expect((await checkBaseline(db, SHIPPED_MIGRATIONS)).status).toBe("current");
  } finally {
    closeDb(db);
  }
});

test("the pre-migration backup restores a commit still in the WAL, from before the migration ran", async ({ importStagingDir }) => {
  await using previous = await migrationsBeforeLatest();
  const where = layoutIn(importStagingDir);
  const db = await previousChainDb(where, previous.path);
  try {
    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(true);
    await boot(db, where);
    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(false);

    const [name, ...others] = backupsIn(where.backupDir);
    expect(others).toEqual([]);
    const backup = await createDb(pathToFileURL(join(where.backupDir, name ?? "missing-backup")).href);
    try {
      expect(await backup.get(sql`PRAGMA integrity_check`)).toEqual({ ["integrity_check"]: "ok" });
      expect(await contents(backup)).toEqual([CONTENT]);
      // The copy predates the boot's migration, so restoring it is a real rollback.
      expect(await hasPendingMigrations(backup, SHIPPED_MIGRATIONS)).toBe(true);
    } finally {
      closeDb(backup);
    }
  } finally {
    closeDb(db);
  }
});

test("a backup that cannot be taken aborts the boot before the migration, and the retry with room migrates", async ({ importStagingDir }) => {
  await using previous = await migrationsBeforeLatest();
  const where = layoutIn(importStagingDir);
  const db = await previousChainDb(where, previous.path);
  try {
    // A regular file where the backup dir's parent must be: the copy cannot be written.
    writeFileSync(join(where.dir, "blocker"), "not a directory");
    const blocked = join(where.dir, "blocker", "backups");
    await expect(boot(db, where, { backupDir: blocked })).rejects.toMatchObject({ code: "ENOTDIR" });
    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(true);
    expect(await contents(db)).toEqual([CONTENT]);

    // Control: the same database with room for the copy gets past the same step.
    await boot(db, where);
    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(false);
    expect(backupsIn(where.backupDir)).toHaveLength(1);
  } finally {
    closeDb(db);
  }
});

test("debris at the backup's own path is replaced by a real snapshot instead of wedging every retry", async ({ importStagingDir }) => {
  await using previous = await migrationsBeforeLatest();
  const where = layoutIn(importStagingDir);
  const db = await previousChainDb(where, previous.path);
  try {
    // The name a boot would give this copy comes from the source's own timestamps; ask production for it.
    const probeDir = join(where.dir, "probe");
    const probe = await backupBeforeMigrate(db, where.url, probeDir);
    const name = backupsIn(probeDir)[0] ?? "missing-backup";
    expect(probe).toBe(join(probeDir, name));
    mkdirSync(where.backupDir, { recursive: true });
    const debris = join(where.backupDir, name);
    writeFileSync(debris, "occupied");

    await boot(db, where);

    expect(await hasPendingMigrations(db, SHIPPED_MIGRATIONS)).toBe(false);
    expect(backupsIn(where.backupDir)).toEqual([name]);
    const replaced = await createDb(pathToFileURL(debris).href);
    try {
      expect(await contents(replaced)).toEqual([CONTENT]);
    } finally {
      closeDb(replaced);
    }
  } finally {
    closeDb(db);
  }
});

test("a boot that migrates prunes the oldest backups and keeps the newest; a boot with nothing pending prunes nothing", async ({ importStagingDir }) => {
  await using previous = await migrationsBeforeLatest();
  const where = layoutIn(importStagingDir);
  const db = await previousChainDb(where, previous.path);
  try {
    mkdirSync(where.backupDir, { recursive: true });
    const stamps = [1, 2, 3, 4, 5, 6, 7, 8];
    for (const stamp of stamps) {
      const planted = `${DB_NAME}.backup-${stamp}`;
      // A planted copy must be one the sweep recognises, or the retention case proves nothing.
      expect(isBackupFileName(planted, DB_NAME)).toBe(true);
      writeFileSync(join(where.backupDir, planted), "older backup");
    }
    await boot(db, where);

    const kept = backupsIn(where.backupDir);
    const oldest = `${DB_NAME}.backup-1`;
    const newestPlanted = `${DB_NAME}.backup-8`;
    expect(kept).toContain(newestPlanted);
    expect(kept).not.toContain(oldest);
    const taken = kept.filter((name) => !stamps.some((stamp) => name === `${DB_NAME}.backup-${stamp}`));
    expect(taken).toHaveLength(1);

    // A no-op boot touches the backup dir not at all, so a copy older than every kept one survives it.
    const stale = `${DB_NAME}.backup-0`;
    writeFileSync(join(where.backupDir, stale), "older backup");
    await boot(db, where);
    expect(backupsIn(where.backupDir)).toContain(stale);
  } finally {
    closeDb(db);
  }
});

test("a database that recorded a migration the shipped chain does not hold refuses to boot, and nothing is wiped or copied", async ({ importStagingDir }) => {
  const where = layoutIn(importStagingDir);
  const db = await createDb(where.url);
  try {
    await boot(db, where);
    await seedMessageRow(db, { content: CONTENT });
    // Control: the same database boots again while its record matches the shipped chain.
    await boot(db, where);
    const copies = backupsIn(where.backupDir);

    // What a squashed or edited baseline leaves behind: the recorded migration is in no shipped entry.
    await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
    expect((await checkBaseline(db, SHIPPED_MIGRATIONS)).status).toBe("regenerated");
    // The refusal is the boot's own typed error; a drizzle or SQLite failure from re-applying the chain is not.
    await expect(boot(db, where)).rejects.toBeInstanceOf(DomainOperationError);

    expect(await contents(db)).toEqual([CONTENT]);
    expect(backupsIn(where.backupDir)).toEqual(copies);
    expect((await checkBaseline(db, SHIPPED_MIGRATIONS)).status).toBe("regenerated");
  } finally {
    closeDb(db);
  }
});
