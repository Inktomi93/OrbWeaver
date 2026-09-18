// Boot-migration integration: baseline apply/reset, WAL-complete backup/retention, integrity gate, and
// launched refusal against real libSQL memory and file databases.

import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import { checkBaseline, createDb, runMigrations } from "@orb/db";
import { DB_LAUNCHED, resolveMigrationsFolder, runBootMigrations } from "@orb/server/entry/boot";
import { sql } from "drizzle-orm";
import { expect, test } from "../../../support/fixtures.ts";

const FK_ON = 1;
const BACKUP_RE = /\.backup-\d+$/;
const SENTINEL_TABLES = ["users", "characters", "chats", "workloads", "presets"];
const ALREADY_EXISTS_RE = /already exists/i;
// `backupBeforeMigrate`'s own refusal, not just "something threw" — the abort must be the BACKUP failing.
const BACKUP_FAILED_RE = /pre-migrate backup of .* FAILED/;
const LAUNCHED_FATAL_RE = /launched/i;

test("resolveMigrationsFolder points at @orb/db's generated baseline dir", () => {
  const folder = resolveMigrationsFolder();
  expect(folder.endsWith("migrations")).toBe(true);
  expect(existsSync(folder)).toBe(true);
});

test("runBootMigrations applies the baseline on a fresh db + passes the integrity gate", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:", launched: false });
  // Each select throws if the baseline didn't create the table (independent → run together).
  await Promise.all(SENTINEL_TABLES.map((table) => db.run(sql.raw(`select count(*) from ${table}`))));
  const row = await db.get<Record<string, number>>(sql`PRAGMA foreign_keys`);
  expect(row?.["foreign_keys"]).toBe(FK_ON);
});

test("runBootMigrations is idempotent — a second run is a no-op, not an error", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:", launched: false });
  // "current" pins that a normal boot's record MATCHES the shipped baseline exactly — without it this
  // test would still pass if every boot silently auto-reset (reset also resolves undefined).
  expect((await checkBaseline(db, resolveMigrationsFolder())).status).toBe("current");
  await expect(runBootMigrations({ db, databaseUrl: ":memory:", launched: false })).resolves.toBeUndefined();
  expect((await checkBaseline(db, resolveMigrationsFolder())).status).toBe("current");
});

// A regenerated baseline changes its journal `when` (and hash), so drizzle's migrator sees the recorded
// migration as OLDER than the shipped one and RE-APPLIES the baseline over the existing tables. Simulate
// that by back-dating the recorded `created_at` — the raw drizzle path then dies exactly the way boot did
// pre-fix (`table … already exists`). This pins the bug the auto-reset defends against.
test("BUG (unguarded): a stale baseline record makes raw runMigrations re-run the baseline + crash", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:", launched: false });
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
  await expect(runMigrations(db, resolveMigrationsFolder())).rejects.toThrow(ALREADY_EXISTS_RE);
});

test("runBootMigrations auto-resets a regenerated-baseline dev db + re-migrates clean", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:", launched: false });
  // A sentinel object we can prove the reset wiped, plus a real row to prove data loss is total.
  await db.run(sql`CREATE TABLE sentinel_probe (x integer)`);
  await db.run(sql`INSERT INTO sentinel_probe (x) VALUES (1)`);
  // Simulate the post-squash-regen state: the recorded baseline no longer matches the shipped one.
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);

  await expect(runBootMigrations({ db, databaseUrl: ":memory:", launched: false })).resolves.toBeUndefined();

  // The reset dropped everything (incl. the sentinel) and re-applied the fresh baseline.
  const sentinel = await db.all(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sentinel_probe'`);
  expect(sentinel.length).toBe(0);
  await Promise.all(SENTINEL_TABLES.map((table) => db.run(sql.raw(`select count(*) from ${table}`))));
});

// The backup gate, on a REAL file db (`:memory:` can't be backed up, so the other tests say nothing about
// it). Pre-fix boot copied the db aside unconditionally, and a no-op boot is the overwhelmingly common one
// — every dev-stack / lane restart re-runs this step — which grew `data/` to 3.2k copies / 150GB.
test("the pre-migration backup is taken on a boot that MIGRATES and skipped on a no-op boot", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-bootbackup-${pid}-`));
  const url = `file:${join(dir, "orb.db")}`;
  try {
    const db = await createDb(url);
    await runBootMigrations({ db, databaseUrl: url, launched: false });
    const afterMigrate = readdirSync(dir).filter((name) => BACKUP_RE.test(name));
    expect(afterMigrate).toHaveLength(1);

    // Second boot: the baseline is already recorded, nothing is pending ⇒ no new copy of the db.
    await runBootMigrations({ db, databaseUrl: url, launched: false });
    expect(readdirSync(dir).filter((name) => BACKUP_RE.test(name))).toEqual(afterMigrate);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the pre-migration backup restores a commit that remains in the live WAL", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-bootwal-${pid}-`));
  const path = join(dir, "orb.db");
  const url = `file:${path}`;
  try {
    const db = await createDb(url);
    await runBootMigrations({ db, databaseUrl: url, launched: false });
    const priorBackups = new Set(readdirSync(dir).filter((name) => BACKUP_RE.test(name)));

    await db.run(sql`CREATE TABLE backup_probe (value text not null)`);
    await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
    await db.run(sql`INSERT INTO backup_probe (value) VALUES ('committed-in-wal')`);
    await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
    expect(await db.all(sql`SELECT value FROM backup_probe`)).toEqual([{ value: "committed-in-wal" }]);
    expect(statSync(`${path}-wal`).size).toBeGreaterThan(0);

    await runBootMigrations({ db, databaseUrl: url, launched: false });

    const created = readdirSync(dir).filter((name) => BACKUP_RE.test(name) && !priorBackups.has(name));
    expect(created).toHaveLength(1);
    const backupPath = join(dir, created[0] ?? "missing-backup");
    expect(existsSync(`${backupPath}-wal`)).toBe(false);
    expect(existsSync(`${backupPath}-shm`)).toBe(false);
    const backupDb = await createDb(`file:${backupPath}`);
    const integrity = await backupDb.get<Record<string, string>>(sql`PRAGMA integrity_check`);
    expect(integrity?.["integrity_check"]).toBe("ok");
    expect(await backupDb.all(sql`SELECT value FROM backup_probe`)).toEqual([{ value: "committed-in-wal" }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Seed a file db that is one back-dated migration record away from a DESTRUCTIVE regenerated-baseline
// boot, with a probe row whose survival proves the reset did not run.
async function seedResetPendingDb(dir: string): Promise<{ db: Awaited<ReturnType<typeof createDb>>; url: string }> {
  const url = `file:${join(dir, "orb.db")}`;
  const db = await createDb(url);
  await runBootMigrations({ db, databaseUrl: url, launched: false });
  await db.run(sql`CREATE TABLE backup_failure_probe (value integer not null)`);
  await db.run(sql`INSERT INTO backup_failure_probe (value) VALUES (1)`);
  await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
  return { db, url };
}

// RE-PINNED for #1374 (#1548). This used to make the backup fail by writing "occupied" at the stamped
// destination — `VACUUM INTO` refused an existing file. That refusal was the WEDGE (#1374): the failed boot
// wrote nothing, so the mtimes never moved, so every retry recomputed the same name and failed identically,
// forever. `backupBeforeMigrate` now reads an occupied destination as either a complete backup of this exact
// source (reuse) or DEBRIS (delete + retry), so the old setup no longer fails at all — the CONTROL below
// pins that new arm. The ORDERING invariant this test exists for is unchanged, so it now fails the backup
// for a reason the idempotent-retry arm cannot absorb and never touches the destination file: SQLite
// refuses `VACUUM INTO` from inside an open transaction.
test("backup failure aborts before a regenerated-baseline reset", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-bootbackup-fail-${pid}-`));
  try {
    const { db, url } = await seedResetPendingDb(dir);
    expect(await db.all(sql`SELECT value FROM backup_failure_probe`)).toEqual([{ value: 1 }]);
    // The seeding boot took its own backup; only what the FAILING boot leaves behind is under test.
    const priorBackups = readdirSync(dir).filter((name) => BACKUP_RE.test(name));

    await db.run(sql`BEGIN`);
    await expect(runBootMigrations({ db, databaseUrl: url, launched: false })).rejects.toThrow(BACKUP_FAILED_RE);
    await db.run(sql`ROLLBACK`);

    // The abort came BEFORE the reset: the data is still there and the baseline is still the pending one.
    expect(await db.all(sql`SELECT value FROM backup_failure_probe`)).toEqual([{ value: 1 }]);
    expect((await checkBaseline(db, resolveMigrationsFolder())).status).toBe("regenerated");
    // …and the failed attempt left NO new file behind, so the next boot retries clean rather than wedging.
    expect(readdirSync(dir).filter((name) => BACKUP_RE.test(name))).toEqual(priorBackups);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The CONTROL for the arm above (#1374): debris at the stamped path is NOT a backup failure. It is deleted
// and re-copied, the boot proceeds, and the destructive reset runs — the boot-wedge this arm removed.
test("#1374: debris at the stamped backup path is replaced, and the boot proceeds to the reset", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-bootbackup-debris-${pid}-`));
  try {
    const { db, url } = await seedResetPendingDb(dir);
    const path = join(dir, "orb.db");
    // Debris at EXACTLY the destination this boot will compute (the newer of the db / -wal mtimes).
    const debrisPath = `${path}.backup-${Math.round(Math.max(statSync(path).mtimeMs, statSync(`${path}-wal`).mtimeMs))}`;
    writeFileSync(debrisPath, "occupied");

    await expect(runBootMigrations({ db, databaseUrl: url, launched: false })).resolves.toBeUndefined();

    // The reset ran (the probe table is gone) and the baseline is current again.
    await expect(db.all(sql`SELECT value FROM backup_failure_probe`)).rejects.toThrow();
    expect((await checkBaseline(db, resolveMigrationsFolder())).status).toBe("current");
    // The debris was REPLACED by a real snapshot, not reused: it opens and carries the pre-reset probe row.
    const restored = await createDb(`file:${debrisPath}`);
    expect(await restored.all(sql`SELECT value FROM backup_failure_probe`)).toEqual([{ value: 1 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a regenerated-baseline boot (the destructive reset) still backs up first, then prunes to the cap", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-bootprune-${pid}-`));
  const url = `file:${join(dir, "orb.db")}`;
  try {
    const db = await createDb(url);
    await runBootMigrations({ db, databaseUrl: url, launched: false });
    const first = readdirSync(dir).filter((name) => BACKUP_RE.test(name));
    expect(first).toHaveLength(1);
    // Force six more change-boots by back-dating the recorded baseline each time (the post-squash-regen
    // state). Each one resets + re-migrates, so each MUST take its own backup before dropping the tables.
    for (let i = 0; i < 6; i++) {
      await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
      await runBootMigrations({ db, databaseUrl: url, launched: false });
    }
    // 7 backups taken, retention keeps 5 (all same-day, so the per-day rollup adds nothing) — and the
    // very first one is gone, which is only true if all 7 were really taken and eviction really ran.
    const remaining = readdirSync(dir).filter((name) => BACKUP_RE.test(name));
    expect(remaining).toHaveLength(5);
    expect(remaining).not.toContain(first[0]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// THE SHIPPED POSTURE, on a REAL FILE DB (#316 Arm A, 2026-09-18). Every test above and below drives the
// arms with a LITERAL `launched:`, which says nothing about what production actually passes — and the
// #1392 incident was precisely a guard that was correct and never armed. This one asserts the constant the
// composition root hands in, then proves that under it the destructive path is unreachable AND costs
// nothing: the boot aborts BEFORE the backup copy (there is no db change to protect) and the row a reset
// would have dropped is still there afterwards.
test("the shipped DB_LAUNCHED posture refuses a diverged chain on a real file db, before any backup", async () => {
  expect(DB_LAUNCHED).toBe(true);
  const dir = mkdtempSync(join(tmpdir(), `orb-bootlaunched-${pid}-`));
  const url = `file:${join(dir, "orb.db")}`;
  try {
    const db = await createDb(url);
    // A fresh db under the SHIPPED posture migrates normally — the refusal is about drift, not about being
    // launched, and a flip that bricked every first boot would pass a refusal-only assertion.
    await runBootMigrations({ db, databaseUrl: url, launched: DB_LAUNCHED });
    await db.run(sql`CREATE TABLE launched_probe (value integer not null)`);
    await db.run(sql`INSERT INTO launched_probe (value) VALUES (1)`);
    const priorBackups = readdirSync(dir).filter((name) => BACKUP_RE.test(name));

    // The post-squash / edited-applied-migration state: what this db recorded is in no shipped entry.
    await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
    await expect(runBootMigrations({ db, databaseUrl: url, launched: DB_LAUNCHED })).rejects.toThrow(LAUNCHED_FATAL_RE);

    expect(await db.all(sql`SELECT value FROM launched_probe`)).toEqual([{ value: 1 }]);
    expect(readdirSync(dir).filter((name) => BACKUP_RE.test(name))).toEqual(priorBackups);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a LAUNCHED db refuses to auto-wipe — a baseline mismatch is boot-FATAL", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:", launched: false });
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
  await expect(runBootMigrations({ db, databaseUrl: ":memory:", launched: true })).rejects.toThrow(LAUNCHED_FATAL_RE);
});

// #1392, the companion to the type pin at `migrate.test-d.ts`: the gate above had never fired on a real boot
// because `entry/lifecycle` OMITTED `launched` entirely and `??` resolved the omission to the permissive arm.
// The key is required now, so this shape cannot be written by a typed caller at all — which is exactly why the
// pin has to construct it through `unknown`. The invariant is the RUNTIME half: an `undefined` reaching the
// guard (an untyped caller, a JSON-shaped deps blob) takes the REFUSAL arm, never `resetDevDatabase`. Only an
// EXPLICIT `launched: false` buys the auto-wipe.
test("OMITTING `launched` cannot reach the destructive branch — absence is fail-CLOSED", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:", launched: false });
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
  // @orb-waive no-test-fabrication(unknown): the deliberate deps-without-the-flag probe — the pre-#1392 lifecycle call verbatim. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const withoutFlag = { db, databaseUrl: ":memory:" } as unknown as Parameters<typeof runBootMigrations>[0];
  await expect(runBootMigrations(withoutFlag)).rejects.toThrow(LAUNCHED_FATAL_RE);
});
