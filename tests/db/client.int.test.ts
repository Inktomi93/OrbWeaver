// Smoke .int test for the @orb/db floor: the FK PRAGMA dance, the integrity gate, a users round-trip,
// the unified constraint classifier, and the backup lifecycle (`hasPendingMigrations` + the
// `pruneDbBackups` retention sweep, incl. its adversarial-filename blast radius). Real libSQL :memory:
// (the integration lane). NOTE: Wave-0 has no FK-bearing tables (users/audit have none), so the constraint
// test exercises a UNIQUE violation; the foreign-key arm of isConstraintViolation is exercised by the
// Wave-1 slices that land real FKs.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import {
  assertReferentialIntegrity,
  backupBeforeMigrate,
  buildResetDropScript,
  checkBaseline,
  createDb,
  forecastDevDbReset,
  hasPendingMigrations,
  listBackupFiles,
  localPath,
  preCloseHousekeeping,
  pruneDbBackups,
  runMigrations,
  users,
} from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import { handleKey } from "@orb/kit/handle-key";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq, sql } from "drizzle-orm";
import { freshDb } from "../support/db.ts";
import { expect, test } from "../support/fixtures.ts";

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

test("the busy_timeout survives a CONNECTION REPLACEMENT (the Config.timeout belt, not the boot PRAGMA)", async () => {
  // The libSQL local driver's `Sqlite3Client` holds ONE native connection and REPLACES it (a fresh
  // `new Database(path, options)`, none of createDb's PRAGMAs re-applied) the moment anything calls
  // `client.transaction()` — @libsql/client@0.17.4 sqlite3.js:155-159 nulls `#db`, and `#getDb()`
  // lazily re-opens. drizzle's `db.transaction()` is exactly that call (drizzle-orm/libsql/session.js:61).
  // The boot PRAGMA cannot guard that second connection; only the `timeout` baked into the client's
  // stored options (which `#getDb()` re-passes) can. Product code BANS `db.transaction()` (the :memory:
  // trap — a replaced `:memory:` connection is an EMPTY db), so this drives it deliberately, on a FILE
  // db, as the one reachable way to force the replacement the belt exists for.
  const path = join(mkdtempSync(join(tmpdir(), `orb-belt-${pid}-`)), "t.db");
  try {
    const db = await createDb(`file:${path}`);
    await db.transaction(async () => {
      // empty: the replacement happens at BEGIN, not from anything the body does
    });
    const timeout = await db.get<Record<string, number>>(sql`PRAGMA busy_timeout`);
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

// THE SILENT-TRUNCATION TRIPWIRE (#179). A comment in the memory-segments spec asserted that libSQL
// "silently stores an EMPTY string for a TEXT bind past ~1MB" — a success return with destroyed content, the
// worst failure mode a persistence layer has. It is FALSE on the pinned driver: probed on @libsql/client
// 0.17.4 every layer round-trips byte-exact — raw client on `file:` and `:memory:`, `client.batch`, drizzle,
// and end-to-end through `message_variants` + `loadCanonThroughSeq` at 3M, 6.2M, 13M and 26.1M chars. So
// there is no threshold to guard and NO write boundary gets a size cap: capping would also contradict the
// memory ruling that content is chunked losslessly, never dropped (#172/#165).
//
// This test exists so that stops being true LOUDLY. A libSQL bump that introduces a bind-size truncation
// would otherwise destroy chat/import/databank content with a success return and no test in the tree would
// notice. Sizes straddle the claimed 1MiB boundary and go well past it; the multibyte case proves the
// round-trip is not a BYTE cap either (each `é` is 2 UTF-8 bytes, so it crosses 1MiB at half the chars).
// Equality is asserted by DIGEST, not `toBe` — a failing multi-MB string comparison prints an unusable diff.
const MULTIBYTE_CHARS = 700_000; // 1.4 MB of UTF-8

/** `HEAD…TAIL`-sentinelled filler of EXACTLY `size` chars — the sentinels make a head/tail-side cut legible. */
function asciiCase(size: number): { label: string; text: string } {
  return { label: `${size} ascii chars`, text: `HEAD${"a".repeat(size - 8)}TAIL` };
}

function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

test("a large TEXT bind round-trips byte-exact — no silent truncation past 1MiB (#179)", async () => {
  const db = await createDb(":memory:");
  await db.run(sql`CREATE TABLE bind_probe (id INTEGER PRIMARY KEY, v TEXT NOT NULL)`);

  // A TUPLE: `db.batch` takes a NON-EMPTY tuple, so the head is destructured out (a bare `.map` widens to a
  // possibly-empty array and `tsc` rejects it) rather than asserted non-empty.
  const cases = [
    asciiCase(1_048_575), // 1MiB − 1
    asciiCase(1_048_576), // exactly 1MiB
    asciiCase(1_048_577), // 1MiB + 1
    asciiCase(4_000_000), // well past any plausible cap
    { label: `${MULTIBYTE_CHARS} multibyte chars`, text: `HEAD${"é".repeat(MULTIBYTE_CHARS)}TAIL` },
  ] as const;

  // db.batch — the path domain writes actually take (an interactive transaction replaces the connection).
  const insert = (text: string): ReturnType<typeof db.run> => db.run(sql`INSERT INTO bind_probe (v) VALUES (${text})`);
  const [first, ...others] = cases;
  await db.batch([insert(first.text), ...others.map((c) => insert(c.text))]);

  const rows = await db.all<Record<string, unknown>>(sql`SELECT id, v, length(v) AS len, typeof(v) AS ty FROM bind_probe ORDER BY id`);
  expect(rows).toHaveLength(cases.length);
  for (const [index, expected] of cases.entries()) {
    const row = rows[index];
    // typeof first: a bind that degraded to NULL/BLOB is a different destruction than a truncation.
    expect(`${expected.label}: ${String(row?.["ty"])}`).toBe(`${expected.label}: text`);
    expect(`${expected.label}: ${String(row?.["len"])}`).toBe(`${expected.label}: ${expected.text.length}`);
    expect(`${expected.label}: ${digest(String(row?.["v"]))}`).toBe(`${expected.label}: ${digest(expected.text)}`);
  }
});

test("users insert→select round-trips (branded id survives, role enum accepted)", async () => {
  const db = await freshDb();
  const id = castId<UserId>("user_roundtrip");
  await db.insert(users).values({
    id,
    handle: castId<Handle>("alice"),
    role: "owner",
    handleKey: handleKey(castId<Handle>("alice")),
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
    handleKey: handleKey(castId<Handle>("user-a")),
  });

  let caught: unknown;
  try {
    await db.insert(users).values({
      id: castId<UserId>("user_b"),
      handle: castId<Handle>("user-b"),
      externalId, // collides on the unique-when-set external_id index
      handleKey: handleKey(castId<Handle>("user-b")),
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

/** A scratch dir holding a live db file, plus a `backups/` dir holding the named files; returns the dir,
 *  the backup dir and the `file:` url. */
function backupFixture(names: readonly string[]): { dir: string; backupDir: string; url: string } {
  const dir = mkdtempSync(join(tmpdir(), `orb-prune-${pid}-`));
  const backupDir = join(dir, "backups");
  mkdirSync(backupDir);
  writeFileSync(join(dir, DB_FILE), "db");
  for (const name of names) {
    writeFileSync(join(backupDir, name), "x");
  }
  return { dir, backupDir, url: `file:${join(dir, DB_FILE)}` };
}

function backupName(stamp: number, suffix = ""): string {
  return `${DB_FILE}.backup-${stamp}${suffix}`;
}

test("pruneDbBackups keeps the 5 newest same-day backups and deletes the rest", () => {
  // 12 backups an hour apart inside ONE day: the per-day rule adds nothing beyond the newest, so the
  // recent-5 cap is what's under test.
  const stamps = Array.from({ length: 12 }, (_, i) => BASE_DAY * DAY_MS + i * HOUR_MS);
  const { dir, backupDir, url } = backupFixture(stamps.map((s) => backupName(s)));
  try {
    const deleted = pruneDbBackups(url, backupDir);
    const survivors = stamps.filter((s) => existsSync(join(backupDir, backupName(s))));
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
  const { dir, backupDir, url } = backupFixture(stamps.map((s) => backupName(s)));
  try {
    pruneDbBackups(url, backupDir);
    const survivors = stamps.filter((s) => existsSync(join(backupDir, backupName(s))));
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
  const { dir, backupDir, url } = backupFixture([
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
      writeFileSync(join(backupDir, backupName(kept + i * HOUR_MS)), "x");
    }
    pruneDbBackups(url, backupDir);
    expect(existsSync(join(backupDir, backupName(kept, "-wal")))).toBe(true);
    expect(existsSync(join(backupDir, backupName(kept, "-shm")))).toBe(true);
    expect(existsSync(join(backupDir, backupName(dropped)))).toBe(false);
    expect(existsSync(join(backupDir, backupName(dropped, "-wal")))).toBe(false);
    expect(existsSync(join(backupDir, backupName(orphanDay, "-wal")))).toBe(false);
    expect(existsSync(join(backupDir, backupName(orphanDay, "-shm")))).toBe(false);
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
  const { dir, backupDir, url } = backupFixture([...bystanders, ...doomed.map((s) => backupName(s))]);
  try {
    // A DIRECTORY named exactly like a backup: the sweep is files-only and must never recurse into it.
    const dirTrap = join(backupDir, backupName(BASE_DAY * DAY_MS - DAY_MS));
    mkdirSync(dirTrap);
    writeFileSync(join(dirTrap, "inside.txt"), "x");

    const deleted = pruneDbBackups(url, backupDir);
    expect(deleted).toEqual([join(backupDir, backupName(doomed[0] ?? 0))]);
    expect(existsSync(join(dir, DB_FILE))).toBe(true);
    for (const name of bystanders) {
      expect({ name, exists: existsSync(join(backupDir, name)) }).toEqual({ name, exists: true });
    }
    expect(existsSync(join(dirTrap, "inside.txt"))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the PIN marker (#534, the #533 incident) --------------------------------------------------------
// A `.keep` sibling exempts one backup from the sweep forever. The class it exists for: a baseline-hash
// change auto-resets the dev db at the next respawn, and the boot's own pre-migrate copy is the ONLY
// record of what was dropped — which the next few migrating boots then age out.

test("pruneDbBackups never deletes a `.keep`-pinned backup, however old", () => {
  // The pinned stamp is the OLDEST of twelve same-day backups: without the pin it is the first thing the
  // recent-5 cap evicts, so a green here cannot come from the budget rescuing it.
  const stamps = Array.from({ length: 12 }, (_, i) => BASE_DAY * DAY_MS + i * HOUR_MS);
  const pinnedStamp = stamps[0] ?? 0;
  const { dir, backupDir, url } = backupFixture(stamps.map((s) => backupName(s)));
  try {
    writeFileSync(join(backupDir, `${backupName(pinnedStamp)}.keep`), "");
    const deleted = pruneDbBackups(url, backupDir);
    expect(existsSync(join(backupDir, backupName(pinnedStamp)))).toBe(true);
    expect(deleted).not.toContain(join(backupDir, backupName(pinnedStamp)));
    // The pin is ADDITIVE — the recent-5 budget is unchanged, so the six between it and them still go.
    expect(deleted).toHaveLength(6);
    // The marker itself is outside the sweep's pattern and survives too (removing a pin is a hand act).
    expect(existsSync(join(backupDir, `${backupName(pinnedStamp)}.keep`))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a `.keep` marker pins its OWN stamp only — the twin one hour older is still swept", () => {
  // The two-sided control: without this, "pinning works" could equally describe a sweep that stopped
  // deleting at all.
  const stamps = Array.from({ length: 12 }, (_, i) => BASE_DAY * DAY_MS + i * HOUR_MS);
  const pinnedStamp = stamps[1] ?? 0;
  const neighbour = stamps[0] ?? 0;
  const { dir, backupDir, url } = backupFixture(stamps.map((s) => backupName(s)));
  try {
    writeFileSync(join(backupDir, `${backupName(pinnedStamp)}.keep`), "");
    pruneDbBackups(url, backupDir);
    expect(existsSync(join(backupDir, backupName(pinnedStamp)))).toBe(true);
    expect(existsSync(join(backupDir, backupName(neighbour)))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a `.keep` marker for a stamp with no base copy pins nothing — orphan sidecars still go", () => {
  const orphan = (BASE_DAY - 30) * DAY_MS;
  const { dir, backupDir, url } = backupFixture([backupName(orphan, "-wal"), backupName(orphan, "-shm")]);
  try {
    writeFileSync(join(backupDir, `${backupName(orphan)}.keep`), "");
    pruneDbBackups(url, backupDir);
    expect(existsSync(join(backupDir, backupName(orphan, "-wal")))).toBe(false);
    expect(existsSync(join(backupDir, backupName(orphan, "-shm")))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pruneDbBackups is a no-op for :memory: / non-file urls", () => {
  expect(pruneDbBackups(":memory:", tmpdir())).toEqual([]);
  expect(pruneDbBackups("libsql://example.turso.io", tmpdir())).toEqual([]);
});

// --- forecastDevDbReset (the dev-db DROP tripwire, #534) ---------------------------------------------
// The forecast is what `pnpm check`'s db-baseline stage turns into a `[verify-notice]` line. Its whole
// job is to be RIGHT about "the next respawn will wipe this db" BEFORE the respawn — the #533 loss had
// no signal at all until the server log, hours later. Every arm is pinned, including the two silent ones
// (a lane worktree has no db; a fresh checkout's db is trivial) and the "I could not measure" arm.

const PAD_MIB = 9; // > MIN_FORECAST_BYTES (8 MiB) — the threshold that silences a fresh checkout's db.
const SHIPPED_TAG = "0000_baseline";
const SHIPPED_WHEN = 1_700_000_000_000;
const NEXT_TAG = "0001_probe";
const NEXT_WHEN = SHIPPED_WHEN + 1000;

interface ChainEntry {
  readonly tag: string;
  readonly when: number;
  readonly sqlText: string;
}

/** A migrations folder shaped exactly as drizzle's own: `meta/_journal.json` + one `<tag>.sql` per entry,
 *  in journal (apply) order. The CHAIN form, not a single baseline, because since #316 the identity a db
 *  is judged against is the SET of shipped migrations rather than the newest one. */
function chainFixture(dir: string, entries: readonly ChainEntry[]): string {
  const folder = join(dir, "migrations");
  mkdirSync(join(folder, "meta"), { recursive: true });
  for (const entry of entries) {
    writeFileSync(join(folder, `${entry.tag}.sql`), entry.sqlText);
  }
  writeFileSync(join(folder, "meta", "_journal.json"), JSON.stringify({ entries: entries.map((e) => ({ when: e.when, tag: e.tag })) }));
  return folder;
}

/** The one-entry pre-launch shape, still the committed reality today. */
function migrationsFixture(dir: string, sqlText: string): string {
  return chainFixture(dir, [{ tag: SHIPPED_TAG, when: SHIPPED_WHEN, sqlText }]);
}

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

/** A `:memory:` db carrying exactly one `__drizzle_migrations` row — what drizzle's migrator writes. */
async function dbRecording(applied: { hash: string; when: number }): Promise<Awaited<ReturnType<typeof createDb>>> {
  const db = await createDb(":memory:");
  await db.run(sql`CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)`);
  await db.run(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${applied.hash}, ${applied.when})`);
  return db;
}

/** A real file db, padded past the trivial threshold, optionally carrying a `__drizzle_migrations` row. */
async function forecastDb(dir: string, applied?: { hash: string; when: number }): Promise<string> {
  const url = `file:${join(dir, "forecast.db")}`;
  const db = await createDb(url);
  // randomblob server-side: a >1MB TEXT bind through libSQL lands EMPTY, so the padding is generated in SQL.
  await db.run(sql`CREATE TABLE pad (b BLOB)`);
  for (let i = 0; i < PAD_MIB; i++) {
    await db.run(sql`INSERT INTO pad (b) VALUES (randomblob(1048576))`);
  }
  if (applied !== undefined) {
    await db.run(sql`CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)`);
    await db.run(sql`INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${applied.hash}, ${applied.when})`);
  }
  return url;
}

test("forecastDevDbReset is silent where there is nothing to warn about (no db / a fresh small one)", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-forecast-${pid}-`));
  try {
    const folder = migrationsFixture(dir, "CREATE TABLE a (id TEXT);");
    expect((await forecastDevDbReset(":memory:", folder)).status).toBe("no-db");
    expect((await forecastDevDbReset(`file:${join(dir, "nope.db")}`, folder)).status).toBe("no-db");
    // A freshly-migrated db is a few hundred KB: losing it costs nothing, so it must not cry wolf.
    const fresh = `file:${join(dir, "fresh.db")}`;
    await createDb(fresh);
    expect((await forecastDevDbReset(fresh, folder)).status).toBe("trivial");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a populated db whose recorded migration is in NO shipped entry is `diverged`", async () => {
  // THE pin: this exact state is what boot/migrate turns into a boot REFUSAL since #316 (and turned into
  // `resetDevDatabase` — ALL DATA DROPPED — before it). The forecast must say so while the data is still
  // there. A TWO-entry chain, so the arm is judged against the whole chain and the reported `shippedHash`
  // is provably the newest entry rather than the only one.
  const dir = mkdtempSync(join(tmpdir(), `orb-forecast-${pid}-`));
  try {
    const folder = chainFixture(dir, [
      { tag: SHIPPED_TAG, when: SHIPPED_WHEN, sqlText: "CREATE TABLE a (id TEXT);" },
      { tag: NEXT_TAG, when: NEXT_WHEN, sqlText: "ALTER TABLE a ADD COLUMN b TEXT;" },
    ]);
    const url = await forecastDb(dir, { hash: "a".repeat(64), when: SHIPPED_WHEN });
    const forecast = await forecastDevDbReset(url, folder);
    // One object assertion, not a narrowed branch: a conditional expect can pass by never running.
    expect({ ...forecast, path: "<path>", bytes: 0 }).toEqual({
      status: "diverged",
      path: "<path>",
      bytes: 0,
      appliedHash: "a".repeat(64),
      shippedHash: sha256("ALTER TABLE a ADD COLUMN b TEXT;"),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a db BEHIND the chain (applied 0000, 0001 shipped) is `current` — pending is not divergence", async () => {
  // The #316 regression arm. While the chain was a single baseline, "matches the newest shipped entry" and
  // "is in the shipped chain" were the same question; post-flip they are not, and reading the first as the
  // second would make every forward migration a FATAL boot (`DB_LAUNCHED` turns `regenerated` into a
  // throw). A db that simply has not applied 0001 yet is the ordinary case, not drift.
  const dir = mkdtempSync(join(tmpdir(), `orb-forecast-${pid}-`));
  try {
    const baselineSql = "CREATE TABLE a (id TEXT);";
    const folder = chainFixture(dir, [
      { tag: SHIPPED_TAG, when: SHIPPED_WHEN, sqlText: baselineSql },
      { tag: NEXT_TAG, when: NEXT_WHEN, sqlText: "ALTER TABLE a ADD COLUMN b TEXT;" },
    ]);
    const url = await forecastDb(dir, { hash: sha256(baselineSql), when: SHIPPED_WHEN });
    expect((await forecastDevDbReset(url, folder)).status).toBe("current");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// `checkBaseline` is the same verdict the BOOT reads (the forecast is its answerable-without-booting
// twin), and it is the one `DB_LAUNCHED` turns into a refusal — so both chain arms are pinned here too,
// against a real `__drizzle_migrations` row rather than through the file-size-gated forecast.
test("checkBaseline: a db behind the chain is `current`, a db holding an unshipped migration is `regenerated`", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-checkbaseline-${pid}-`));
  try {
    const baselineSql = "CREATE TABLE a (id TEXT);";
    const nextSql = "ALTER TABLE a ADD COLUMN b TEXT;";
    const folder = chainFixture(dir, [
      { tag: SHIPPED_TAG, when: SHIPPED_WHEN, sqlText: baselineSql },
      { tag: NEXT_TAG, when: NEXT_WHEN, sqlText: nextSql },
    ]);
    const behind = await dbRecording({ hash: sha256(baselineSql), when: SHIPPED_WHEN });
    expect(await checkBaseline(behind, folder)).toEqual({ status: "current" });

    // The same db against a REWRITTEN 0000 — an applied migration edited under a live database, the one
    // thing regime 2 forbids. It is in no shipped entry, so the verdict is drift and the reported
    // `currentHash` is the chain TIP a fresh db would end at.
    const rewritten = chainFixture(join(dir, "rewritten"), [
      { tag: SHIPPED_TAG, when: SHIPPED_WHEN, sqlText: `${baselineSql} -- hand-edited` },
      { tag: NEXT_TAG, when: NEXT_WHEN, sqlText: nextSql },
    ]);
    expect(await checkBaseline(behind, rewritten)).toEqual({
      status: "regenerated",
      appliedHash: sha256(baselineSql),
      currentHash: sha256(nextSql),
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the same db is `current` once its recorded baseline matches — the alarm is not always-on", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-forecast-${pid}-`));
  try {
    const sqlText = "CREATE TABLE a (id TEXT);";
    const folder = migrationsFixture(dir, sqlText);
    const hash = createHash("sha256").update(sqlText).digest("hex");
    const url = await forecastDb(dir, { hash, when: SHIPPED_WHEN });
    expect((await forecastDevDbReset(url, folder)).status).toBe("current");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a populated db with no migrations bookkeeping is `unknown`, never silence", async () => {
  // ZERO HYGIENE: a db the forecast cannot read must SAY it could not read it. Silence here would read
  // exactly like "safe", which is the failure mode this whole tripwire exists to end.
  const dir = mkdtempSync(join(tmpdir(), `orb-forecast-${pid}-`));
  try {
    const folder = migrationsFixture(dir, "CREATE TABLE a (id TEXT);");
    const url = await forecastDb(dir);
    expect((await forecastDevDbReset(url, folder)).status).toBe("unknown");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- backupBeforeMigrate (#1374: a failed backup must be RETRYABLE, never a permanent boot wedge) -----
// The name derives from the source's mtimes and `VACUUM INTO` refuses an existing destination, so a boot
// that failed after the copy appeared recomputed the identical name and failed identically FOREVER — the
// failed boot writes nothing, so the mtimes never move. Recovery was deleting a file nothing named.

test("backupBeforeMigrate is idempotent for an unchanged source — a second boot does NOT wedge (#1374)", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-backup-${pid}-`));
  try {
    const url = `file:${join(dir, DB_FILE)}`;
    const db = await createDb(url);
    await runMigrations(db, MIGRATIONS_DIR);
    const first = await backupBeforeMigrate(db, url, dir);
    expect(first).toBeDefined();
    // The SECOND call is the one that used to throw "output file already exists" and abort boot.
    const second = await backupBeforeMigrate(db, url, dir);
    expect(second).toBe(first);
    expect(existsSync(String(first))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("backupBeforeMigrate REPLACES the debris of an interrupted backup rather than reusing it (#1374)", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-backup-debris-${pid}-`));
  try {
    const url = `file:${join(dir, DB_FILE)}`;
    const db = await createDb(url);
    await runMigrations(db, MIGRATIONS_DIR);
    const path = String(await backupBeforeMigrate(db, url, dir));
    // What an interrupted VACUUM INTO leaves behind: a file at the destination that is not a readable db.
    writeFileSync(path, "half a database");
    const retried = await backupBeforeMigrate(db, url, dir);
    expect(retried).toBe(path);
    // The retry produced a REAL snapshot, not a reused corpse: it opens and carries the migrated schema.
    const restored = await createDb(`file:${path}`);
    expect(await hasPendingMigrations(restored, MIGRATIONS_DIR)).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The THIRD arm, and the one the idempotent/debris pair could not see: what happens when the copy itself
// FAILS. Only the two success-shaped arms were pinned, so the `catch` — which is the whole reason a failed
// boot is retryable — was covered by nobody. It has two obligations and this asserts both: it must ABORT
// (never migrate an un-backed-up database) and it must leave NO PARTIAL FILE behind, because the next boot
// recomputes the SAME name from the same unmoved mtimes and would otherwise find its own corpse there.
//
// HONEST LABEL: this is a FENCE, not a defect proof — it passed on the unmodified source the moment it was
// written, because the `catch`'s `removeBackupFiles` is already correct. It exists so a future edit that
// drops the cleanup (or downgrades the throw to a warn-and-continue) goes red instead of silently
// re-introducing the #1374 permanent boot wedge. The control below proves it CAN fail: it is the same
// scenario with the cleanup's effect undone, and it reds.
test("backupBeforeMigrate ABORTS on a failed copy and leaves no partial file behind", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-backup-fail-${pid}-`));
  try {
    const url = `file:${join(dir, DB_FILE)}`;
    // A real db first (the source must exist, or the backup is a no-op return).
    const seed = await createDb(url);
    await runMigrations(seed, MIGRATIONS_DIR);

    // The same `wrap` seam `server/observability` decorates the client through — here it fails ONLY the
    // copy, so everything up to the VACUUM behaves normally and the failure is the one under test.
    const failing = await createDb(
      url,
      (base) =>
        new Proxy(base, {
          get(target, prop, receiver): unknown {
            if (prop === "execute") {
              return (stmt: unknown): Promise<unknown> => {
                const text = typeof stmt === "string" ? stmt : String((stmt as { sql?: string }).sql);
                if (text.includes("VACUUM INTO")) {
                  // What a full disk / a read-only directory produces at exactly this call.
                  return Promise.reject(new Error("disk I/O error (test)"));
                }
                return target.execute(stmt as Parameters<typeof target.execute>[0]);
              };
            }
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    );

    // (a) it ABORTS, and the message is the operator's recovery instruction rather than a bare driver error.
    await expect(backupBeforeMigrate(failing, url, dir)).rejects.toThrow(/pre-migrate backup .* FAILED/);

    // (b) NOTHING is left at the destination. Asserted over the whole directory rather than a recomputed
    // path, so a partial copy under ANY of the three names (base/-wal/-shm) fails this.
    const debris = readdirSync(dir).filter((name) => name.includes(".backup-"));
    expect(debris).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// THE PLANTED CONTROL for the fence above — the arm that proves assertion (b) can actually fail. The
// scenario is identical except the copy leaves a partial file the cleanup does not know about (`VACUUM
// INTO` is faked to WRITE the destination and THEN reject, which is what a mid-write ENOSPC does). If
// `removeBackupFiles` ever stopped running in the `catch`, the real test above would look exactly like
// this — so this pins the shape of that failure rather than leaving "it passed" unexamined.
test("CONTROL: a partial copy the cleanup does not remove IS visible to the debris assertion", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-backup-control-${pid}-`));
  try {
    const url = `file:${join(dir, DB_FILE)}`;
    const seed = await createDb(url);
    await runMigrations(seed, MIGRATIONS_DIR);

    const failing = await createDb(
      url,
      (base) =>
        new Proxy(base, {
          get(target, prop, receiver): unknown {
            if (prop === "execute") {
              return (stmt: unknown): Promise<unknown> => {
                const text = typeof stmt === "string" ? stmt : String((stmt as { sql?: string }).sql);
                if (text.includes("VACUUM INTO")) {
                  // The destination the real code is about to clean up — written under a name the sweep's
                  // own cleanup does NOT cover, standing in for "the cleanup did not run".
                  writeFileSync(join(dir, `${DB_FILE}.backup-uncleaned`), "half a database");
                  return Promise.reject(new Error("disk full mid-copy (test)"));
                }
                return target.execute(stmt as Parameters<typeof target.execute>[0]);
              };
            }
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    );

    await expect(backupBeforeMigrate(failing, url, dir)).rejects.toThrow(/pre-migrate backup .* FAILED/);
    // The SAME assertion the fence makes — here it finds debris, which is what makes the fence meaningful.
    expect(readdirSync(dir).filter((name) => name.includes(".backup-"))).not.toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- the lifecycle + dev-reset paths (#1376) ---------------------------------------------------------

test("preCloseHousekeeping still CLOSES the client when a housekeeping PRAGMA throws (#1376)", async () => {
  let closes = 0;
  // The wrap seam is how `server/observability` decorates the client; here it fails the checkpoint and
  // counts closes. Before the `finally`, a throwing PRAGMA skipped `close()` and leaked the handle.
  const db = await createDb(
    ":memory:",
    (base) =>
      new Proxy(base, {
        get(target, prop, receiver): unknown {
          if (prop === "execute") {
            return (stmt: unknown): Promise<unknown> => {
              const text = typeof stmt === "string" ? stmt : String((stmt as { sql?: string }).sql);
              if (text.includes("wal_checkpoint")) {
                return Promise.reject(new Error("checkpoint refused (test)"));
              }
              return target.execute(stmt as Parameters<typeof target.execute>[0]);
            };
          }
          if (prop === "close") {
            return (): void => {
              closes += 1;
              target.close();
            };
          }
          const value: unknown = Reflect.get(target, prop, receiver);
          return typeof value === "function" ? value.bind(target) : value;
        },
      }),
  );
  // Drizzle re-wraps the driver error, so the pin is the FAILING STATEMENT, not our test message.
  await expect(preCloseHousekeeping(db)).rejects.toThrow(/wal_checkpoint/u);
  expect(closes).toBe(1);
});

// The reset DROPS THE DEV DATABASE, so it is never executed to be tested — the script it would run is.
test("buildResetDropScript wraps the drops in ONE transaction and escapes identifiers (#1376)", () => {
  const script = buildResetDropScript([
    { type: "table", name: "users" },
    { type: "index", name: "users_handle_idx" },
    { type: "table", name: 'evil"; DROP TABLE users; --' },
  ]);
  const lines = script.split("\n");
  // Atomicity: `executeMultiple` is a bare `db.exec` with no implicit transaction, so a mid-script failure
  // used to leave earlier DROPs committed and later ones un-run.
  expect(lines[0]).toBe("BEGIN;");
  expect(lines.at(-1)).toBe("COMMIT;");
  // Dependents before the tables they hang off (the RESET_DROP_ORDER contract) — index before table.
  expect(lines.indexOf('DROP index IF EXISTS "users_handle_idx";')).toBeLessThan(lines.indexOf('DROP table IF EXISTS "users";'));
  // Injection: the embedded quote is DOUBLED, so the identifier never closes early and the trailing
  // statement stays inert text inside it.
  expect(script).toContain('DROP table IF EXISTS "evil""; DROP TABLE users; --";');
  // Nothing to drop ⇒ no script at all (never a bare BEGIN/COMMIT).
  expect(buildResetDropScript([])).toBe("");
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

// --- the backup DIRECTORY (`backups/` beside `db/`, never inside it) ---------------------------------
// Both verbs take the directory explicitly. A pin is read from THAT directory only: a `.keep` beside the db
// names nothing, so a stale marker left in the old location cannot silently exempt a copy in the new one.

test("backupBeforeMigrate writes the copy into the given backup dir, not beside the db", async () => {
  const dir = mkdtempSync(join(tmpdir(), `orb-backupdir-${pid}-`));
  try {
    const url = `file:${join(dir, DB_FILE)}`;
    const backupDir = join(dir, "backups");
    const db = await createDb(url);
    await runMigrations(db, MIGRATIONS_DIR);
    const path = String(await backupBeforeMigrate(db, url, backupDir));
    expect(path.startsWith(`${backupDir}/`)).toBe(true);
    expect(existsSync(path)).toBe(true);
    expect(readdirSync(dir).filter((name) => name.includes(".backup-"))).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pruneDbBackups honours a `.keep` pin in the backup dir and ignores one beside the db", () => {
  const stamps = Array.from({ length: 12 }, (_, i) => BASE_DAY * DAY_MS + i * HOUR_MS);
  const pinnedInBackupDir = stamps[0] ?? 0;
  const pinnedBesideDb = stamps[1] ?? 0;
  const { dir, backupDir, url } = backupFixture(stamps.map((s) => backupName(s)));
  try {
    writeFileSync(join(backupDir, `${backupName(pinnedInBackupDir)}.keep`), "");
    writeFileSync(join(dir, `${backupName(pinnedBesideDb)}.keep`), "");
    const deleted = pruneDbBackups(url, backupDir);
    expect(existsSync(join(backupDir, backupName(pinnedInBackupDir)))).toBe(true);
    // The marker beside the db is not in the backup dir, so its stamp is swept like any other.
    expect(deleted).toContain(join(backupDir, backupName(pinnedBesideDb)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("listBackupFiles names every backup copy, sidecar and pin for the base, and nothing else", () => {
  const stamp = BASE_DAY * DAY_MS;
  const { dir, backupDir } = backupFixture([
    backupName(stamp),
    backupName(stamp, "-wal"),
    backupName(stamp, "-shm"),
    `${backupName(stamp)}.keep`,
    "other.db.backup-1",
    `${DB_FILE}-wal`,
    `${DB_FILE}.backup-12a`,
  ]);
  try {
    const expected = [backupName(stamp), backupName(stamp, "-shm"), backupName(stamp, "-wal"), `${backupName(stamp)}.keep`];
    expect([...listBackupFiles(backupDir, DB_FILE)].sort()).toEqual([...expected].sort());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
