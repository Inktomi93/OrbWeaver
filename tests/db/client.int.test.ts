// Smoke .int test for the @orb/db floor: the FK PRAGMA dance, the integrity gate, a users round-trip,
// the unified constraint classifier, and the backup lifecycle (`hasPendingMigrations` + the
// `pruneDbBackups` retention sweep, incl. its adversarial-filename blast radius). Real libSQL :memory:
// (the integration lane). NOTE: Wave-0 has no FK-bearing tables (users/audit have none), so the constraint
// test exercises a UNIQUE violation; the foreign-key arm of isConstraintViolation is exercised by the
// Wave-1 slices that land real FKs.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import { assertReferentialIntegrity, createDb, hasPendingMigrations, localPath, pruneDbBackups, runMigrations, users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../support/db";
import { expect, test } from "../support/fixtures";

const FK_ON = 1;
const BUSY_TIMEOUT_MS = 5000;
// The committed baseline + the runMigrations FK-dance + assertReferentialIntegrity's throw path (freshDb
// PUSHes, so it exercises none of these).
const MIGRATIONS_DIR = "packages/db/src/migrations";
// A sentinel table from across the dependency tiers — each select throws if the baseline didn't create it.
const SENTINEL_TABLES = ["users", "characters", "chats", "message_variants", "chat_digests"];
const ORPHAN_RE = /orphan FK row/u;

test("createDb turns foreign_keys ON and the readback sticks", async () => {
  const db = await createDb(":memory:");
  const row = await db.get<Record<string, number>>(sql`PRAGMA foreign_keys`);
  expect(row?.["foreign_keys"]).toBe(FK_ON);
});

test("createDb applies the tuning PRAGMAs on a file db (WAL + busy_timeout stick)", async () => {
  // WAL is file-only, so this needs a real file — :memory: reports journal_mode=memory (the next test).
  // mkdtemp gives OS-provided uniqueness (no ambient Date.now — test-determinism gate); pid keeps the
  // prefix readable across parallel workers.
  const path = join(mkdtempSync(join(tmpdir(), `orb-pragma-${pid}-`)), "t.db");
  try {
    const db = await createDb(`file:${path}`);
    // journal_mode reads back on `journal_mode`; busy_timeout reads back on `timeout` (libSQL column name).
    const journal = await db.get<Record<string, string>>(sql`PRAGMA journal_mode`);
    const timeout = await db.get<Record<string, number>>(sql`PRAGMA busy_timeout`);
    expect(journal?.["journal_mode"]).toBe("wal");
    expect(timeout?.["timeout"]).toBe(BUSY_TIMEOUT_MS);
  } finally {
    for (const suffix of ["", "-wal", "-shm"]) {
      rmSync(`${path}${suffix}`, { force: true });
    }
  }
});

test("localPath: a relative `file:./x` url scheme-strips (never fileURLToPath, which absolutizes the dot-segment against ROOT)", () => {
  expect(localPath("file:./data/orbweaver.db")).toBe("./data/orbweaver.db");
  expect(localPath("file:relative.db")).toBe("relative.db");
  expect(localPath("file:/abs.db")).toBe("/abs.db");
});

test("localPath: the file:// authority form still resolves through fileURLToPath", () => {
  expect(localPath("file:///abs/path.db")).toBe("/abs/path.db");
});

test("localPath: undefined for :memory: and non-file urls", () => {
  expect(localPath(":memory:")).toBeUndefined();
  expect(localPath("libsql://example.turso.io")).toBeUndefined();
});

test("createDb still boots a :memory: db (the WAL readback assert is file-only)", async () => {
  // :memory: correctly reports journal_mode=memory; createDb must NOT boot-refuse on that.
  const db = await createDb(":memory:");
  const journal = await db.get<Record<string, string>>(sql`PRAGMA journal_mode`);
  expect(journal?.["journal_mode"]).toBe("memory");
});

test("assertReferentialIntegrity passes on the freshly-applied schema", async () => {
  const db = await freshDb();
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
});

test("users insert→select round-trips (branded id survives, role enum accepted)", async () => {
  const db = await freshDb();
  const id = castId<UserId>("user_roundtrip");
  await db.insert(users).values({
    id,
    handle: castId<Handle>("alice"),
    role: "owner",
  });

  const rows = await db.select().from(users).where(eq(users.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(id);
  expect(rows[0]?.role).toBe("owner");
  expect(rows[0]?.enabled).toBe(true);
});

test("a UNIQUE violation is caught + classified by isConstraintViolation", async () => {
  const db = await freshDb();
  const externalId = castId<ExternalId>("sso-sub-shared");
  await db.insert(users).values({
    id: castId<UserId>("user_a"),
    handle: castId<Handle>("user-a"),
    externalId,
  });

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_b"),
      handle: castId<Handle>("user-b"),
      externalId, // collides on the unique-when-set external_id index
    });
  } catch (err) {
    caught = err;
  }

  const violation = isConstraintViolation(caught);
  expect(violation).toBeDefined();
  expect(violation?.kind).toBe("unique");
});

test("the 0000_baseline migration applies on a fresh db and passes assertReferentialIntegrity", async () => {
  const db = await createDb(":memory:");
  await runMigrations(db, MIGRATIONS_DIR);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  // Each select throws if the baseline didn't create the table (independent → run together).
  await Promise.all(SENTINEL_TABLES.map((table) => db.run(sql.raw(`select count(*) from ${table}`))));
});

test("runMigrations restores foreign_keys ON afterward (the finally-restore contract)", async () => {
  // runMigrations toggles FK enforcement OFF for the table-rebuild, then restores ON in finally. If a
  // future migration left it OFF, every subsequent write would bypass FK enforcement silently.
  const db = await createDb(":memory:");
  await runMigrations(db, MIGRATIONS_DIR);
  const row = await db.get<Record<string, number>>(sql`PRAGMA foreign_keys`);
  expect(row?.["foreign_keys"]).toBe(FK_ON);
});

test("assertReferentialIntegrity THROWS on an orphan FK row (the foreign_key_check gate)", async () => {
  const db = await createDb(":memory:");
  await runMigrations(db, MIGRATIONS_DIR);
  // Plant an orphan with enforcement OFF — a session pointing at a non-existent user — then re-check.
  await db.run(sql`PRAGMA foreign_keys = OFF`);
  await db.run(sql.raw("insert into sessions (id, user_id, token_hash, expires_at) values ('session_orphan', 'user_ghost', 'h', 1)"));
  await expect(assertReferentialIntegrity(db)).rejects.toThrow(ORPHAN_RE);
});

test("hasPendingMigrations: true on a fresh db, false once the baseline is applied (the no-op-boot gate)", async () => {
  // This is what the boot step gates the pre-migration backup on — if it ever returned a blanket `true`,
  // every dev-stack restart would copy the db aside again (the 3.2k-backup / 150GB leak).
  const db = await createDb(":memory:");
  expect(await hasPendingMigrations(db, MIGRATIONS_DIR)).toBe(true);
  await runMigrations(db, MIGRATIONS_DIR);
  expect(await hasPendingMigrations(db, MIGRATIONS_DIR)).toBe(false);
});

// --- pruneDbBackups (the retention sweep) -----------------------------------------------------------
// It runs at BOOT against the LIVE db directory, so every test here is as much about what it must NOT
// touch as about what it deletes. Stamps are built off exact day multiples (the sweep buckets by
// floor(epoch-ms / day)) — no ambient clock, so the day arithmetic is deterministic.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DB_FILE = "orbweaver.db";
const BASE_DAY = 20_000; // an arbitrary fixed day index; absolute value is irrelevant to the sweep

/** A scratch dir holding a live db file + the named siblings; returns its path and the `file:` url. */
function backupFixture(names: readonly string[]): { dir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), `orb-prune-${pid}-`));
  writeFileSync(join(dir, DB_FILE), "db");
  for (const name of names) {
    writeFileSync(join(dir, name), "x");
  }
  return { dir, url: `file:${join(dir, DB_FILE)}` };
}

function backupName(stamp: number, suffix = ""): string {
  return `${DB_FILE}.backup-${stamp}${suffix}`;
}

test("pruneDbBackups keeps the 5 newest same-day backups and deletes the rest", () => {
  // 12 backups an hour apart inside ONE day: the per-day rule adds nothing beyond the newest, so the
  // recent-5 cap is what's under test.
  const stamps = Array.from({ length: 12 }, (_, i) => BASE_DAY * DAY_MS + i * HOUR_MS);
  const { dir, url } = backupFixture(stamps.map((s) => backupName(s)));
  try {
    const deleted = pruneDbBackups(url);
    const survivors = stamps.filter((s) => existsSync(join(dir, backupName(s))));
    expect(survivors).toEqual(stamps.slice(-5));
    expect(deleted).toHaveLength(7);
    expect(existsSync(join(dir, DB_FILE))).toBe(true); // never the live db
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pruneDbBackups keeps the newest of each of the last 7 days on top of the recent 5", () => {
  // One backup per day for 10 consecutive days: recent-5 covers days 0-4, the daily rollup extends the
  // history to 7 distinct days, and days 7-9 (the oldest three) go.
  const stamps = Array.from({ length: 10 }, (_, k) => (BASE_DAY - k) * DAY_MS);
  const { dir, url } = backupFixture(stamps.map((s) => backupName(s)));
  try {
    pruneDbBackups(url);
    const survivors = stamps.filter((s) => existsSync(join(dir, backupName(s))));
    expect(survivors).toEqual(stamps.slice(0, 7));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pruneDbBackups takes the -wal/-shm sidecars with their backup, and orphaned sidecars always", () => {
  // Mid-day, so the whole cluster lands on ONE day — otherwise `dropped` would be the newest of the
  // previous day and the daily rollup would (correctly) rescue it.
  const kept = BASE_DAY * DAY_MS + 12 * HOUR_MS;
  const dropped = kept - HOUR_MS;
  const orphanDay = (BASE_DAY - 30) * DAY_MS; // old enough to fall outside the daily window either way
  const { dir, url } = backupFixture([
    backupName(kept),
    backupName(kept, "-wal"),
    backupName(kept, "-shm"),
    backupName(dropped),
    backupName(dropped, "-wal"),
    // Sidecars with NO base file: they restore nothing on their own, so they go regardless of age.
    backupName(orphanDay, "-wal"),
    backupName(orphanDay, "-shm"),
  ]);
  try {
    // Four more same-day backups: `kept` is then the 5th-newest (retained, boundary case) and `dropped`
    // the 6th (evicted) — and neither is its day's newest, so the daily rollup can't rescue `dropped`.
    for (let i = 1; i <= 4; i++) {
      writeFileSync(join(dir, backupName(kept + i * HOUR_MS)), "x");
    }
    pruneDbBackups(url);
    expect(existsSync(join(dir, backupName(kept, "-wal")))).toBe(true);
    expect(existsSync(join(dir, backupName(kept, "-shm")))).toBe(true);
    expect(existsSync(join(dir, backupName(dropped)))).toBe(false);
    expect(existsSync(join(dir, backupName(dropped, "-wal")))).toBe(false);
    expect(existsSync(join(dir, backupName(orphanDay, "-wal")))).toBe(false);
    expect(existsSync(join(dir, backupName(orphanDay, "-shm")))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pruneDbBackups matches ONLY `<db>.backup-<digits>` — adversarial neighbours survive untouched", () => {
  // The blast radius if this pattern is loose is the user's data directory. `orbweaverXdb.backup-1` is the
  // unescaped-dot probe; the trailing-newline name pins that `$` is a strict end-anchor (no /m, no /$\n/).
  const bystanders = [
    `${DB_FILE}-wal`,
    `${DB_FILE}-shm`,
    `${DB_FILE}.backup-`,
    `${DB_FILE}.backup-12a`,
    `${DB_FILE}.backup-123.zip`,
    `${DB_FILE}.backup-123-shmx`,
    `${DB_FILE}.backup-1e3`,
    `${DB_FILE}.backup--1`,
    `${DB_FILE}.Backup-1`,
    `x${DB_FILE}.backup-1`,
    "orbweaverXdb.backup-1",
    "other.db.backup-1",
    ` ${DB_FILE}.backup-1`,
    `${DB_FILE}.backup-1\n`,
  ];
  // Plus a real old backup, so a pass that deletes nothing at all can't masquerade as a pass.
  const doomed = Array.from({ length: 6 }, (_, i) => BASE_DAY * DAY_MS + i * HOUR_MS);
  const { dir, url } = backupFixture([...bystanders, ...doomed.map((s) => backupName(s))]);
  try {
    // A DIRECTORY named exactly like a backup: the sweep is files-only and must never recurse into it.
    const dirTrap = join(dir, backupName(BASE_DAY * DAY_MS - DAY_MS));
    mkdirSync(dirTrap);
    writeFileSync(join(dirTrap, "inside.txt"), "x");

    const deleted = pruneDbBackups(url);
    expect(deleted).toEqual([join(dir, backupName(doomed[0] ?? 0))]);
    for (const name of [DB_FILE, ...bystanders]) {
      expect({ name, exists: existsSync(join(dir, name)) }).toEqual({ name, exists: true });
    }
    expect(existsSync(join(dirTrap, "inside.txt"))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pruneDbBackups is a no-op for :memory: / non-file urls", () => {
  expect(pruneDbBackups(":memory:")).toEqual([]);
  expect(pruneDbBackups("libsql://example.turso.io")).toEqual([]);
});

test("createDb auto-creates the parent dir RELATIVE to cwd for a bare file:./ url (never absolutized)", async () => {
  // Regression (2026-07-17): fileURLToPath("file:./data/x.db") does NOT throw — URL normalization resolves
  // the dot-segment against ROOT and absolutized the default url's parent to `/data`, so every fresh full
  // boot died on `mkdir /data` (EACCES) and the e2e-smoke webServer could not start. The bare relative
  // form must scheme-strip and create its parent UNDER the cwd. pid keeps parallel workers apart
  // (mkdtemp can't help here — the point is a cwd-RELATIVE path).
  const scratch = `.orb-reldb-${pid}`;
  try {
    await createDb(`file:./${scratch}/t.db`);
    expect(existsSync(scratch)).toBe(true); // created here, relative — not at the filesystem root
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
