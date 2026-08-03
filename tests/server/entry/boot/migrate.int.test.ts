// entry/boot/migrate — the boot migrate step. Covers: the migrations folder resolves from the @orb/db
// package (not cwd) and exists; the baseline applies on a fresh db + passes the integrity gate (sentinel
// tables across the dependency tiers exist); FK enforcement is left ON afterward; the step is idempotent
// (a second run is a no-op, not an error). Real libSQL :memory: (the .int lane). The @orb/db FK-dance +
// integrity-throw internals are covered by tests/db/client.int.test.ts; this pins the entry wiring.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import { checkBaseline, createDb, runMigrations } from "@orb/db";
import { resolveMigrationsFolder, runBootMigrations } from "@orb/server/entry/boot";
import { sql } from "drizzle-orm";
import { expect, test } from "../../../support/fixtures.ts";

const FK_ON = 1;
const BACKUP_RE = /\.backup-\d+$/;
const SENTINEL_TABLES = ["users", "characters", "chats", "workloads", "presets"];
const ALREADY_EXISTS_RE = /already exists/i;
const LAUNCHED_FATAL_RE = /launched/i;

test("resolveMigrationsFolder points at @orb/db's generated baseline dir", () => {
  const folder = resolveMigrationsFolder();
  expect(folder.endsWith("migrations")).toBe(true);
  expect(existsSync(folder)).toBe(true);
});

test("runBootMigrations applies the baseline on a fresh db + passes the integrity gate", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:" });
  // Each select throws if the baseline didn't create the table (independent → run together).
  await Promise.all(SENTINEL_TABLES.map((table) => db.run(sql.raw(`select count(*) from ${table}`))));
  const row = await db.get<Record<string, number>>(sql`PRAGMA foreign_keys`);
  expect(row?.["foreign_keys"]).toBe(FK_ON);
});

test("runBootMigrations is idempotent — a second run is a no-op, not an error", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:" });
  // "current" pins that a normal boot's record MATCHES the shipped baseline exactly — without it this
  // test would still pass if every boot silently auto-reset (reset also resolves undefined).
  expect((await checkBaseline(db, resolveMigrationsFolder())).status).toBe("current");
  await expect(runBootMigrations({ db, databaseUrl: ":memory:" })).resolves.toBeUndefined();
  expect((await checkBaseline(db, resolveMigrationsFolder())).status).toBe("current");
});

// A regenerated baseline changes its journal `when` (and hash), so drizzle's migrator sees the recorded
// migration as OLDER than the shipped one and RE-APPLIES the baseline over the existing tables. Simulate
// that by back-dating the recorded `created_at` — the raw drizzle path then dies exactly the way boot did
// pre-fix (`table … already exists`). This pins the bug the auto-reset defends against.
test("BUG (unguarded): a stale baseline record makes raw runMigrations re-run the baseline + crash", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:" });
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
  await expect(runMigrations(db, resolveMigrationsFolder())).rejects.toThrow(ALREADY_EXISTS_RE);
});

test("runBootMigrations auto-resets a regenerated-baseline dev db + re-migrates clean", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:" });
  // A sentinel object we can prove the reset wiped, plus a real row to prove data loss is total.
  await db.run(sql`CREATE TABLE sentinel_probe (x integer)`);
  await db.run(sql`INSERT INTO sentinel_probe (x) VALUES (1)`);
  // Simulate the post-squash-regen state: the recorded baseline no longer matches the shipped one.
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);

  await expect(runBootMigrations({ db, databaseUrl: ":memory:" })).resolves.toBeUndefined();

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
    await runBootMigrations({ db, databaseUrl: url });
    const afterMigrate = readdirSync(dir).filter((name) => BACKUP_RE.test(name));
    expect(afterMigrate).toHaveLength(1);

    // Second boot: the baseline is already recorded, nothing is pending ⇒ no new copy of the db.
    await runBootMigrations({ db, databaseUrl: url });
    expect(readdirSync(dir).filter((name) => BACKUP_RE.test(name))).toEqual(afterMigrate);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a regenerated-baseline boot (the destructive reset) still backs up first, then prunes to the cap", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-bootprune-${pid}-`));
  const url = `file:${join(dir, "orb.db")}`;
  try {
    const db = await createDb(url);
    await runBootMigrations({ db, databaseUrl: url });
    const first = readdirSync(dir).filter((name) => BACKUP_RE.test(name));
    expect(first).toHaveLength(1);
    // Force six more change-boots by back-dating the recorded baseline each time (the post-squash-regen
    // state). Each one resets + re-migrates, so each MUST take its own backup before dropping the tables.
    for (let i = 0; i < 6; i++) {
      // biome-ignore lint/performance/noAwaitInLoops: the boots must run SEQUENTIALLY — each one back-dates the record the next one reads, and the point is seven distinct backup stamps.
      await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
      await runBootMigrations({ db, databaseUrl: url });
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

test("a LAUNCHED db refuses to auto-wipe — a baseline mismatch is boot-FATAL", async () => {
  const db = await createDb(":memory:");
  await runBootMigrations({ db, databaseUrl: ":memory:" });
  await db.run(sql`UPDATE __drizzle_migrations SET created_at = 0`);
  await expect(runBootMigrations({ db, databaseUrl: ":memory:", launched: true })).rejects.toThrow(LAUNCHED_FATAL_RE);
});
