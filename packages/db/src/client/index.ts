// client.ts — the libSQL client, the PRAGMA discipline, the migration runner, and the lifecycle helpers.
// This is the ONE place that constructs a connection and owns the FK dance (Tier-1-DB.md esoteric #5 + §5).
//
// The OTel tracing wrapper is INJECTED (`wrap`), never imported: `@orb/db` cannot import `@orb/server`
// (the cake), so `server/observability` passes its wrapper IN at `createDb`. node:fs/node:url are
// sanctioned here for the NON-OPTIONAL pre-migration backup (Tier-1-DB.md "backupBeforeMigrate") and its
// retention sweep (`pruneDbBackups`).

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
import { isPlainObject } from "@orb/kit/guards";
import { sql } from "drizzle-orm";
import type { LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
// biome-ignore lint/performance/noNamespaceImport: drizzle needs the whole schema module as `{ schema }` and as `typeof schema` for the Db type — the canonical pattern.
import * as schema from "#schema";

/** The handle every domain's `context.ts` closes over. The `db` row types come off `typeof schema`. */
export type Db = LibSQLDatabase<typeof schema>;

/**
 * The read-only projection of {@link Db} — `select` (the query builder) + `query` (the relational API).
 * Omits every write-capable member (`insert`/`update`/`delete`/`run`/`all`/`get`/`values`/`transaction`/
 * `batch` — several of which can execute arbitrary SQL, not just typed writes). A domain whose context
 * types `db` as `ReadOnlyDb` gets a COMPILE-TIME guarantee it cannot issue a write — `tsc` fails
 * the moment a write call is attempted, closing the gap a prose "read-only" claim can't.
 */
export type ReadOnlyDb = Pick<Db, "select" | "query">;

/**
 * The OTel injection seam: `server/observability` passes a wrapper that decorates the libSQL client with
 * tracing. db never imports observability — the wrapper arrives here. Identity when omitted.
 */
export type LibSqlWrap = (client: Client) => Client;

// `PRAGMA foreign_keys` reads back 1 when enforcement is ON.
const FK_ENABLED = 1;
const FILE_SCHEME = "file:";
const WAL = "wal";

/**
 * How long a blocked writer waits for the write lock before `SQLITE_BUSY`. Applied TWICE, deliberately —
 * see {@link TUNING_PRAGMAS} for which mechanism guards which connection.
 */
const BUSY_TIMEOUT_MS = 5000;

// Per-connection tuning, set at every createDb. journal_mode goes first — the others assume WAL.
// busy_timeout is load-bearing: the workloads worker races HTTP request writes, and without a wait a
// concurrent write throws SQLITE_BUSY immediately instead of retrying for up to 5s. synchronous=NORMAL
// is the safe-under-WAL fsync level; cache_size/mmap_size/temp_store are throughput. libSQL honors all
// six (readback: mmap_size floors to a page boundary, busy_timeout reads back under the `timeout` column).
//
// WHICH MECHANISM GUARDS WHICH CONNECTION (probed against @libsql/client 0.17.4 + libsql 0.5.29, the
// pinned pair — the driver docs' "each execute() runs in its own logical connection" is TRUE of the HTTP
// client and FALSE here, so do not reason from them):
//   · A `file:`/`:memory:` url builds a `Sqlite3Client` (sqlite3.js:55) holding ONE native `libsql`
//     `Database`. Every execute/batch/executeMultiple goes through `#getDb()` and reuses it — so this
//     PRAGMA block, applied once here, covers the WHOLE process lifetime. (Probed: 50 executes later all
//     six still read back.)
//   · EXCEPT `client.transaction()` (sqlite3.js:155-159): it hands the native connection to the
//     transaction object and sets `#db = null`, so the NEXT execute lazily opens a FRESH connection
//     (`new Database(path, options)`) with NONE of these PRAGMAs re-applied. drizzle's `db.transaction()`
//     is exactly that call (drizzle-orm/libsql/session.js:61). Probed fallout on that second connection:
//     busy_timeout → 0 (lost, and every wait-instead-of-throw guarantee with it); synchronous/cache_size/
//     mmap_size/temp_store → defaults (throughput only); journal_mode → still WAL (it is persisted in the
//     db FILE, not the connection); foreign_keys → still 1 (libsql's native `databaseOpen` enables FK
//     enforcement by default, verified by an orphan-FK insert being rejected on that fresh connection —
//     the FK readback below is still the boot gate, but the replacement is not a hole in it).
//   · So the ONE genuinely lost setting is busy_timeout — hence the BELT: `Config.timeout` on
//     `createClient`. It is stored in the client's `#options` and re-passed to every lazily re-opened
//     `Database` (libsql/index.js:93 → the native `databaseOpen`, in MILLISECONDS), which is why it — and
//     only it — survives a connection replacement. It is NOT HTTP-only: probed on `file:` mode, a second
//     writer against a held `BEGIN IMMEDIATE` waited the configured 3000ms before SQLITE_BUSY (vs 0ms
//     with neither mechanism). Both are set: the PRAGMA is what the boot readback + Tier-1-DB.md describe
//     on the primary connection; `Config.timeout` is what covers a connection this module never sees.
//     (`db.transaction()` is separately BANNED in product code — a replaced `:memory:` connection is an
//     EMPTY database — but the belt must not depend on that ban holding.)
const TUNING_PRAGMAS = [
  "journal_mode = WAL",
  `busy_timeout = ${BUSY_TIMEOUT_MS}`,
  "synchronous = NORMAL",
  "cache_size = -1048576",
  "mmap_size = 2147483648",
  "temp_store = MEMORY",
] as const;

// drizzle's returned handle carries `$client` at runtime; `Db` (the public type) intentionally hides it.
// This local (non-exported) accessor is the one place we reach it — for `close()`, which has no
// drizzle-level equivalent.
interface WithClient {
  readonly $client: Client;
}
function clientOf(db: Db): Client {
  return (db as unknown as WithClient).$client;
}

// The on-disk path for a `file:` URL (for the backup + the boot-time parent-dir auto-create), or
// undefined for `:memory:` / non-file URLs. Exported: this is the ONE `file:`-URL→path parser — any
// other site resolving a DATABASE_URL to a filesystem path (e.g. dev tooling's `--fresh` wipe) must
// call THIS, never re-derive it (the `fileURLToPath`-on-a-relative-URL mistake this fixed, 2026-07-17).
export function localPath(url: string): string | undefined {
  if (!url.startsWith(FILE_SCHEME)) {
    return;
  }
  // fileURLToPath ONLY for the authority form (`file://…`). The bare forms libSQL accepts must be
  // scheme-stripped instead: for `file:./data/x.db` fileURLToPath does NOT throw — URL normalization
  // resolves the dot-segment against ROOT and silently absolutizes to `/data/x.db`, so the parent-dir
  // auto-create ran `mkdir /data` → EACCES on every fresh full boot with the default url, and the
  // backup path pointed at a file that doesn't exist (2026-07-17; the old try/catch fallback never
  // fired for `./`-prefixed urls). `file:/abs.db` scheme-strips to the same path fileURLToPath gives.
  if (!url.startsWith(`${FILE_SCHEME}//`)) {
    return url.slice(FILE_SCHEME.length); // file:relative.db · file:./relative.db · file:/abs.db
  }
  return fileURLToPath(url); // file://host-form
}

/**
 * Construct the db. Sets `PRAGMA foreign_keys = ON` + the six-PRAGMA tuning block on the connection AND
 * reads BOTH back — REFUSING to boot if either didn't stick. FK enforcement defaults OFF on SQLite and
 * the schema is FK-dense, so a silent OFF would let orphan writes through; WAL is the durability mode the
 * shutdown checkpoint (`preCloseHousekeeping`) and busy_timeout assume, so a silent fallback to the
 * rollback journal on a `file:` db is a boot-refuse (a `:memory:` db correctly reports `memory` — WAL is
 * file-only, so the readback is only asserted for `file:` URLs). The optional `wrap` decorates the
 * client (OTel) before drizzle binds it.
 */
export async function createDb(url: string, wrap?: LibSqlWrap): Promise<Db> {
  // Auto-create the parent dir for a `file:` db (the default lives under the data root's `db/`).
  // libSQL creates the db file lazily but NOT its parent directory, so a first boot on a fresh checkout
  // would otherwise fail to open `file:./data/db/orbweaver.db`. No-op for `:memory:` / non-file URLs.
  const path = localPath(url);
  if (path !== undefined) {
    mkdirSync(dirname(path), { recursive: true });
  }
  // `timeout` is the busy-timeout BELT (see TUNING_PRAGMAS) — the only setting here that survives the
  // connection replacement `client.transaction()` triggers, because the client re-passes it on re-open.
  const base = createClient({ url, timeout: BUSY_TIMEOUT_MS });
  const client = wrap === undefined ? base : wrap(base);
  await client.execute("PRAGMA foreign_keys = ON");
  const readback = await client.execute("PRAGMA foreign_keys");
  const value = readback.rows[0]?.["foreign_keys"];
  if (value !== FK_ENABLED) {
    throw new Error(`@orb/db: PRAGMA foreign_keys did not stick (read back ${String(value)}); refusing to boot — the FK-dense schema requires enforcement ON.`);
  }
  for (const pragma of TUNING_PRAGMAS) {
    await client.execute(`PRAGMA ${pragma}`);
  }
  // WAL is file-only; a `:memory:`/non-file db reports `memory` and that's correct, so only assert on files.
  if (localPath(url) !== undefined) {
    const mode = await client.execute("PRAGMA journal_mode");
    const journalMode = mode.rows[0]?.["journal_mode"];
    if (journalMode !== WAL) {
      throw new Error(
        `@orb/db: PRAGMA journal_mode did not stick (read back ${String(journalMode)}, expected ${WAL}); refusing to boot — the WAL shutdown checkpoint + busy_timeout wait assume WAL on a file db.`,
      );
    }
  }
  return drizzle(client, { schema });
}

/**
 * Is `path` a COMPLETE sqlite db (i.e. a finished backup), or the debris of an interrupted one? Opens it
 * with a bare client (no pragmas, read-only in effect) and asks SQLite. Any throw ⇒ not usable.
 */
async function isCompleteBackup(path: string): Promise<boolean> {
  const client = createClient({ url: `file:${path}` });
  // @orb-waive caught-failure-ownership(catch): the QUESTION this function asks IS "does this
  // file read as a complete db?" — an unreadable/corrupt/truncated file answers it by throwing, and `false`
  // is that answer, consumed by `backupBeforeMigrate` (which then deletes the file and re-copies). Ends if
  // a caller starts needing the reason rather than the verdict.
  try {
    const result = await client.execute("PRAGMA quick_check");
    return result.rows[0]?.["quick_check"] === "ok";
  } catch {
    return false;
  } finally {
    client.close();
  }
}

/** Remove a backup copy and its sqlite sidecars (a failed `VACUUM INTO` can leave a partial destination). */
function removeBackupFiles(backupPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${backupPath}${suffix}`, { force: true });
  }
}

/**
 * Snapshot the live db BEFORE migrating (NON-OPTIONAL — `assertReferentialIntegrity` is the only
 * post-migration FK gate, so a corrupting migration must be restorable). `VACUUM INTO` runs through the
 * app connection: unlike copying the main file, its consistent snapshot includes committed WAL pages.
 * The copy lands in `backupDir` (created if absent) as `<db basename>.backup-<stamp>`; the caller owns
 * the directory choice so the backup unit and the live db can sit in sibling directories.
 * No-op for `:memory:` / a not-yet-created db. Returns the backup path, or undefined if none.
 *
 * RETRYABLE BY CONSTRUCTION (#1374). The name derives from the source's own mtimes, and `VACUUM INTO`
 * refuses an existing destination — so a failed boot (which writes nothing, leaving the mtimes unchanged)
 * used to compute the identical name, fail identically, and WEDGE BOOT PERMANENTLY, recoverable only by
 * deleting a file nothing told the operator about. The naming stays (`pruneDbBackups` matches
 * `.backup-<digits>` exactly, and a disambiguating suffix would age out of the retention sweep never); what
 * changed is what an existing destination MEANS:
 *  · complete backup of this exact source ⇒ SUCCESS, reused. The source is provably unchanged (its mtimes
 *    are what named the file), so re-copying it would produce a byte-equivalent file. Idempotent.
 *  · anything else (a partial copy from an interrupted vacuum) ⇒ debris, removed, and the vacuum retried.
 * A vacuum that fails cleans up its own partial destination — so the NEXT boot retries from scratch rather
 * than inheriting debris — and throws with the remedy spelled out. Boot stays FATAL on a failed backup
 * (a skipped pre-migration snapshot is worse than a loud refusal); the point is that the refusal is now
 * recoverable rather than permanent.
 */
export async function backupBeforeMigrate(db: Db, url: string, backupDir: string): Promise<string | undefined> {
  const path = localPath(url);
  if (path === undefined || !existsSync(path)) {
    return;
  }
  const walPath = `${path}-wal`;
  const stamp = Math.round(Math.max(statSync(path).mtimeMs, existsSync(walPath) ? statSync(walPath).mtimeMs : 0));
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `${basename(path)}.backup-${stamp}`);
  if (existsSync(backupPath)) {
    if (await isCompleteBackup(backupPath)) {
      return backupPath;
    }
    removeBackupFiles(backupPath);
  }
  try {
    await clientOf(db).execute({ sql: "VACUUM INTO ?", args: [backupPath] });
  } catch (err) {
    removeBackupFiles(backupPath);
    throw new Error(
      `@orb/db: the pre-migrate backup of ${path} to ${backupPath} FAILED (${err instanceof Error ? err.message : String(err)}); boot is aborting rather than migrating an un-backed-up database. The partial copy was removed, so a retry starts clean — free space or fix permissions in ${backupDir} and start again. If it keeps failing, move ${path} aside by hand; nothing has been migrated.`,
      { cause: err },
    );
  }
  return backupPath;
}

// Retention for {@link pruneDbBackups}. Pre-launch these are CONSTANTS, not knobs — every retained backup
// is a full copy of the db, so this cap is the only thing bounding `data/`. (Before the boot step gated
// the backup on pending migrations, every no-op boot copied the db aside: 3.2k copies, 150GB.)
const KEEP_RECENT_BACKUPS = 5;
// On top of the recent five, the newest backup of each of the last N distinct days — a coarse history that
// survives a day of frequent migrating without unbounded growth. Ceiling is KEEP_RECENT + KEEP_DAILY files.
const KEEP_DAILY_BACKUPS = 7;
const MS_PER_DAY = 86_400_000;

/**
 * The PIN marker: an empty sibling file `<db>.backup-<stamp>.keep` in the backup dir makes that backup
 * exempt from the retention sweep, forever, in ADDITION to the recent/daily budget. Creating one is a bare
 * `touch data/backups/orbweaver.db.backup-<stamp>.keep` — deliberately no CLI: the marker IS the
 * mechanism, and a tool that hides `touch` behind a verb is a tool that can rot.
 *
 * WHY IT EXISTS (2026-08-23, issue #534 — the #533 incident): a baseline-hash change auto-resets the dev
 * db at the next respawn, and the ONLY copy of what was dropped is the boot's own pre-migrate backup —
 * which the very next migrating boots age out. Eight hours of corpus analysis survived only because a
 * human copied that file out of `data/` by hand. A pin is the in-tree version of that rescue: mark the
 * backup, and the sweep can never take it.
 *
 * A marker for a stamp with no base copy pins nothing (the orphan sidecars are still swept); the marker
 * file itself is never matched by the sweep's own pattern, so it is never deleted either — an intentional
 * one-way act, removable only by hand.
 *
 * THE ORPHANED MARKER ACCUMULATES, AND THAT IS THE DECISION (#1377 item 7, re-derived and CONFIRMED — the
 * pin regex and the backup-group regex are structurally disjoint, so a `.keep` file never enters `groups`
 * and {@link pruneDbBackups} never considers it). Sweeping a marker whose base copy is gone was weighed
 * and REFUSED: the file is a zero-byte human intent, the ONE artefact in this directory the automation is
 * forbidden to touch, and a sweep of it would have to decide "gone" from a directory listing taken while
 * another boot may be mid-copy. An empty `.keep` beside no backup costs nothing and says something true —
 * that someone once pinned that instant. Deleting a human's marker to tidy a byte is the wrong trade in a
 * mechanism whose entire existence is the #533 data loss.
 */
const PIN_SUFFIX = ".keep";

// One backup instant: the base copy and/or its sqlite sidecars. `hasBase` false ⇒ orphaned sidecars.
interface BackupGroup {
  readonly files: string[];
  hasBase: boolean;
}

/** The sweep's view of the db directory: the backup groups by stamp, and the stamps a `.keep` marker pins. */
interface BackupInventory {
  readonly groups: Map<number, BackupGroup>;
  readonly pinned: Set<number>;
}

// The ONE pair of anchored, regex-escaped name patterns for a db's backups: the copies with their sidecars,
// and the pin markers. Both the retention sweep and the layout migration's enumeration read through these.
function backupNamePatterns(base: string): { readonly backupRe: RegExp; readonly pinRe: RegExp } {
  const escaped = RegExp.escape(base);
  return {
    backupRe: new RegExp(`^${escaped}\\.backup-(\\d+)(-wal|-shm)?$`, "g"),
    pinRe: new RegExp(`^${escaped}\\.backup-(\\d+)${RegExp.escape(PIN_SUFFIX)}$`, "g"),
  };
}

// Regular files only: a directory named like a backup is never a backup.
function backupDirFiles(dir: string): readonly string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
}

/**
 * Every `<db>.backup-<stamp>` file (+ sidecars) in `dir`, grouped by stamp — the narrow match
 * {@link pruneDbBackups} documents — plus the stamps a `<db>.backup-<stamp>.keep` marker pins.
 * `matchAll` over an anchored `g` pattern rather than `exec`: it yields the single match or nothing, with
 * no `null` branch for the type-aware lint to mis-read.
 */
function collectBackupInventory(dir: string, base: string): BackupInventory {
  const { backupRe, pinRe } = backupNamePatterns(base);
  const groups = new Map<number, BackupGroup>();
  const pinned = new Set<number>();
  for (const name of backupDirFiles(dir)) {
    for (const match of name.matchAll(pinRe)) {
      pinned.add(Number(match[1]));
    }
    for (const match of name.matchAll(backupRe)) {
      const stamp = Number(match[1]);
      const group = groups.get(stamp) ?? { files: [], hasBase: false };
      group.files.push(join(dir, name));
      group.hasBase ||= match[2] === undefined;
      groups.set(stamp, group);
    }
  }
  return { groups, pinned };
}

/**
 * The names (not paths) of every backup copy, sidecar and pin marker for `base` in `dir`, by the same
 * anchored patterns the sweep uses — so a caller relocating a backup set moves exactly what the sweep
 * would later manage, and nothing a neighbouring file's name happens to resemble.
 */
export function listBackupFiles(dir: string, base: string): readonly string[] {
  const { backupRe, pinRe } = backupNamePatterns(base);
  return backupDirFiles(dir).filter((name) => [...name.matchAll(backupRe)].length > 0 || [...name.matchAll(pinRe)].length > 0);
}

/**
 * The stamps to KEEP: every PINNED stamp ({@link PIN_SUFFIX}), plus the {@link KEEP_RECENT_BACKUPS}
 * newest, plus the newest of each of the last {@link KEEP_DAILY_BACKUPS} distinct days. Only stamps with
 * a real base file are candidates — an orphan sidecar group restores nothing, so it is never kept, pinned
 * or not.
 */
function retainedStamps({ groups, pinned }: BackupInventory): ReadonlySet<number> {
  // Newest-first, so the first stamp seen for a day IS that day's newest. The day bucket is
  // floor(epoch-ms / 1 day): TZ-independent and clock-free.
  const stamps = [...groups]
    .filter(([, group]) => group.hasBase)
    .map(([stamp]) => stamp)
    .sort((a, b) => b - a);
  const keep = new Set(stamps.slice(0, KEEP_RECENT_BACKUPS));
  for (const stamp of stamps) {
    if (pinned.has(stamp)) {
      keep.add(stamp);
    }
  }
  const days = new Set<number>();
  for (const stamp of stamps) {
    const day = Math.floor(stamp / MS_PER_DAY);
    if (days.has(day)) {
      continue;
    }
    if (days.size >= KEEP_DAILY_BACKUPS) {
      break;
    }
    days.add(day);
    keep.add(stamp);
  }
  return keep;
}

/**
 * Delete stale `<db>.backup-<epoch>` copies (with their `-wal`/`-shm` sidecars), keeping every PINNED
 * stamp ({@link PIN_SUFFIX}) plus the {@link KEEP_RECENT_BACKUPS} newest plus the newest of each of the
 * last {@link KEEP_DAILY_BACKUPS} days. Returns the deleted paths. No-op for `:memory:` / non-file URLs.
 * Called by the boot migrate step AFTER a successful migration — never on a no-op boot.
 *
 * This runs at BOOT against a LIVE data directory, so the match is deliberately narrow: an anchored,
 * regex-ESCAPED basename (its `.` separators must not wildcard onto a neighbour), `\d+` for the stamp (so
 * `.backup-`, `.backup-12a`, `.backup-1.zip`, `-shmx` all fall through), only `backupDir` itself, no
 * recursion, and regular FILES only (a directory named like a backup is never touched). A stamp group with
 * no base file is an orphaned sidecar and is always removed — it restores nothing on its own.
 */
export function pruneDbBackups(url: string, backupDir: string): readonly string[] {
  const path = localPath(url);
  if (path === undefined) {
    return [];
  }
  if (!existsSync(backupDir)) {
    return [];
  }
  const inventory = collectBackupInventory(backupDir, basename(path));
  const keep = retainedStamps(inventory);
  const deleted: string[] = [];
  for (const [stamp, group] of inventory.groups) {
    if (keep.has(stamp)) {
      continue;
    }
    for (const file of group.files) {
      rmSync(file, { force: true });
      deleted.push(file);
    }
  }
  return deleted;
}

/**
 * Suspend connection-level FK enforcement for a SCOPE — `await using _ = await fkEnforcementSuspended(db)`.
 * The restore is the `[Symbol.asyncDispose]`, so the OFF→ON bracket is declarative and cannot be half-written:
 * every exit of the scope (return, throw, or an early return added later) turns enforcement back ON, which is
 * the invariant the two hand-written `finally`s below each re-spelled. This is a RESTORE, not a release — the
 * pragma is connection state, not an acquired resource — but the shape is identical and `await using` is the
 * only spelling that makes the pairing unforgettable. The ON/OFF literals live HERE, once: a caller cannot
 * suspend FKs and restore something else.
 */
async function fkEnforcementSuspended(db: Db): Promise<AsyncDisposable> {
  await db.run(sql`PRAGMA foreign_keys = OFF`);
  return {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await db.run(sql`PRAGMA foreign_keys = ON`);
    },
  };
}

/**
 * Run drizzle migrations with FK enforcement toggled OFF on the CONNECTION for the duration. drizzle's
 * 12-step table rebuild DROPs + recreates tables; with FKs ON, a `DROP TABLE parent` silently
 * cascade-DELETEs a populated db. The in-FILE `PRAGMA foreign_keys=OFF` is a no-op (libSQL batches the
 * migration as one tx and ignores mid-tx toggles) — only the connection-level toggle works. Restored to
 * ON at scope exit so a failed migration still leaves enforcement on.
 */
export async function runMigrations(db: Db, migrationsFolder: string): Promise<void> {
  await using _fkSuspended = await fkEnforcementSuspended(db);
  await migrate(db, { migrationsFolder });
}

/**
 * Run `PRAGMA foreign_key_check` AFTER migration; throw on ANY orphan FK row. This is the one runtime FK
 * gate — it catches a drizzle table-rebuild that dropped an FK clause (the exact
 * `pinnedPersonaId→anchorPersonaId` RENAME-doesn't-rewrite-FK bug) and any pre-existing orphan. Called
 * by `entry/boot/migrate.ts` right after `runMigrations`.
 */
export async function assertReferentialIntegrity(db: Db): Promise<void> {
  const violations = await db.all(sql`PRAGMA foreign_key_check`);
  if (violations.length > 0) {
    throw new Error(
      `@orb/db: foreign_key_check found ${violations.length} orphan FK row(s) after migration — aborting. First: ${JSON.stringify(violations[0])}`,
    );
  }
}

/**
 * The migration-chain drift check. Compares what THIS db recorded in `__drizzle_migrations` (the newest
 * `hash` + `created_at` = folderMillis drizzle's own migrator writes) against the identity of EVERY
 * shipped migration (sha256 of each `<tag>.sql` + its journal `when`), computed identically to drizzle so
 * a byte-identical file compares equal.
 *
 * MATCH ANY ENTRY, NOT THE NEWEST ONE (2026-09-18, #316 Arm A). Until launch the chain was a single
 * regenerated `0000_baseline` and "the newest shipped entry" and "the chain" were the same fact, so this
 * compared against `.at(-1)` alone. Post-launch that read is a trap: a db sitting at `0000` with a freshly
 * committed `0001` is BEHIND, not diverged, and `.at(-1)` reports it `regenerated` — which under
 * `DB_LAUNCHED` is the FATAL arm, i.e. no forward migration could ever be applied. A db whose newest
 * applied migration IS one of the shipped entries is `current` on this axis; `hasPendingMigrations` owns
 * the orthogonal "is there anything left to apply" question and drizzle's migrator applies it.
 *
 * `regenerated` therefore now means: this db applied a migration that is in no shipped entry — an applied
 * `.sql` was edited or deleted (pre-launch that was the routine baseline squash; post-launch it is the
 * thing that must never happen, because drizzle would RE-APPLY over existing tables and die on "table
 * already exists"). `entry/boot/migrate.ts` reads this to decide fatal-vs-reset.
 */
export type BaselineCheck =
  | { readonly status: "fresh" }
  | { readonly status: "current" }
  | { readonly status: "regenerated"; readonly appliedHash: string; readonly currentHash: string };

/** The most-recently-applied migration's (hash, folderMillis), or undefined when `__drizzle_migrations`
 *  doesn't exist / has no rows (a fresh db). Columns are read off a `Record` (not typed literals) to
 *  sidestep the biome⇄tsc snake_case literal-key friction. */
async function readAppliedBaseline(db: Db): Promise<{ hash: string; folderMillis: number } | undefined> {
  const present = await db.all<Record<string, unknown>>(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'`);
  if (present.length === 0) {
    return;
  }
  const rows = await db.all<Record<string, unknown>>(sql`SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1`);
  const row = rows[0];
  if (row === undefined) {
    return;
  }
  return { hash: String(row["hash"]), folderMillis: Number(row["created_at"]) };
}

// The migrations journal drizzle itself reads: one `{ when, tag }` per migration file, in apply order.
//
// VALIDATED, not cast (#1377 item 5). This used to trust `JSON.parse` as the entry shape outright, so a
// truncated or hand-edited journal produced entries whose `when` was `undefined` — and every comparison
// against it (`entry.when > applied.folderMillis`) is then silently `false`, which reads as "no pending
// migrations" rather than as a broken journal. Both consumers below decide whether the DEV DB gets
// migrated (and therefore dropped), so a wrong-shaped journal must be loud here rather than quiet there.
// A hand-rolled check, not zod: `@orb/db` sits below `@orb/contracts` in the cake.
function readJournalEntries(migrationsFolder: string): readonly { readonly when: number; readonly tag: string }[] {
  const path = join(migrationsFolder, "meta", "_journal.json");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!isPlainObject(parsed)) {
    throw new Error(`@orb/db: migrations journal at ${path} is not an object`);
  }
  const raw = parsed["entries"];
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new Error(`@orb/db: migrations journal at ${path} has a non-array 'entries'`);
  }
  const entries = raw.map((entry: unknown, index): { readonly when: number; readonly tag: string } => {
    if (!(isPlainObject(entry) && typeof entry["when"] === "number" && Number.isFinite(entry["when"]) && typeof entry["tag"] === "string")) {
      throw new Error(`@orb/db: migrations journal entry ${index} is not { when: number, tag: string }`);
    }
    return { when: entry["when"], tag: entry["tag"] };
  });
  // ORDER IS AN ASSUMPTION EVERY CONSUMER MAKES (#1377 item 6) — `shippedMigrationChain` takes `.at(-1)`
  // as "the newest" and `hasPendingMigrations` walks the list in apply order. Drizzle generates the file in
  // apply order, so this asserts an invariant rather than imposing one; stating it means a generator that
  // ever stopped sorting is a loud error instead of a chain tip computed off the wrong migration.
  for (let i = 1; i < entries.length; i += 1) {
    if ((entries[i]?.when ?? 0) < (entries[i - 1]?.when ?? 0)) {
      throw new Error(`@orb/db: migrations journal at ${path} is not ordered by 'when' (entry ${i} predates ${i - 1})`);
    }
  }
  return entries;
}

/**
 * Would {@link runMigrations} actually APPLY something? Mirrors drizzle's migrator selection exactly: it
 * applies every journal entry whose `when` is newer than the newest `created_at` in `__drizzle_migrations`
 * (and all of them when that table is absent/empty). Read-only.
 *
 * The boot step gates the pre-migration backup on this: a no-op boot (every dev-stack restart) must NOT
 * copy the db aside, while the backup-before-change guarantee is unchanged for boots that change anything.
 */
export async function hasPendingMigrations(db: Db, migrationsFolder: string): Promise<boolean> {
  const entries = readJournalEntries(migrationsFolder);
  const applied = await readAppliedBaseline(db);
  if (applied === undefined) {
    return entries.length > 0;
  }
  return entries.some((entry) => entry.when > applied.folderMillis);
}

interface MigrationIdentity {
  readonly hash: string;
  readonly folderMillis: number;
}

interface ShippedChain {
  /** Every shipped migration, in journal (apply) order. */
  readonly all: readonly MigrationIdentity[];
  /** The last entry — the identity a fresh db ends at once the whole chain has been applied. */
  readonly newest: MigrationIdentity;
}

// Every shipped migration's identity, computed EXACTLY as drizzle's `readMigrationFiles` records it:
// sha256 of the raw `<tag>.sql` bytes + the journal entry's `when`, in journal (apply) order. The whole
// chain rather than its tip, because "the db recorded something we no longer ship" is a claim about the
// SET (the drift check above), while the tip is only the identity a full apply ends at.
function shippedMigrationChain(migrationsFolder: string): ShippedChain {
  const all = readJournalEntries(migrationsFolder).map((entry) => ({
    hash: createHash("sha256")
      .update(readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf-8"))
      .digest("hex"),
    folderMillis: entry.when,
  }));
  const newest = all.at(-1);
  if (newest === undefined) {
    throw new Error("@orb/db: migrations journal has no entries — cannot compute migration identities");
  }
  return { all, newest };
}

/** Is this db's newest applied migration one of the shipped ones? Identity is (hash, folderMillis) — the
 *  two fields drizzle's own migrator writes and compares on. */
function isShippedMigration(applied: MigrationIdentity, shipped: readonly MigrationIdentity[]): boolean {
  return shipped.some((entry) => entry.hash === applied.hash && entry.folderMillis === applied.folderMillis);
}

/** Classify this db against the shipped migration chain (see {@link BaselineCheck}). */
export async function checkBaseline(db: Db, migrationsFolder: string): Promise<BaselineCheck> {
  const applied = await readAppliedBaseline(db);
  if (applied === undefined) {
    return { status: "fresh" };
  }
  const shipped = shippedMigrationChain(migrationsFolder);
  if (isShippedMigration(applied, shipped.all)) {
    return { status: "current" };
  }
  // The newest shipped identity is what a fresh db would end at — the most useful thing to print beside
  // the orphaned one the db actually holds.
  return { status: "regenerated", appliedHash: applied.hash, currentHash: shipped.newest.hash };
}

// ── the CHAIN-DIVERGENCE FORECAST (issue #534, minted from #533; re-aimed 2026-09-18 by #316) ────────
// Minted as a DROP forecast: pre-launch the reset below was by design, and what was missing was a tripwire
// at the DECISION point — on 2026-08-23 a lane hand-edited `0000_baseline.sql`, the hash changed, and the
// next `node --watch` respawn dropped a 1,242-chat import plus ten corpus-analysis passes (~8h GPU), the
// only warning being a server.log line read hours later. Since the launch flip the consequence it forecasts
// is the OPPOSITE one: the next boot REFUSES to start. The question is unchanged and still answerable
// WITHOUT booting — "is what this db recorded still in the shipped chain?" — and it is the same verdict
// {@link checkBaseline} gives the boot step. `pnpm check`'s db-baseline stage is the live caller.
//
// READ-ONLY BY CONSTRUCTION: it opens a bare client (NO pragmas — not even the tuning block) and issues
// two SELECTs. It never migrates, never writes, and never decides anything.
const MIN_FORECAST_BYTES = 8_388_608; // 8 MiB — a freshly-migrated, never-used db is well under this.

/**
 * What the next boot would make of the db at this URL.
 * · `no-db` — not a file URL, or nothing on disk yet.
 * · `trivial` — smaller than {@link MIN_FORECAST_BYTES}; a fresh checkout's db is not worth a warning.
 *   NOTE the direction: SQLite does not shrink on DROP, so a reset db keeps its pages and stays
 *   "non-trivial" — this threshold silences a NEW db, it never certifies that a big one holds data.
 *   STATED PLAINLY (#1376 item 4, resolved as a documented limit rather than a fix): a REAL dataset that
 *   happens to be under 8 MiB — a handful of chats, a small import — is classified `trivial` and gets NO
 *   warning. Post-#316 the cost of that silence is far lower than it was (the un-warned boot now refuses
 *   rather than wipes), and the threshold is kept because the alternative (warn on every fresh checkout)
 *   is the alarm nobody reads.
 * · `current` — this db's newest applied migration is one of the shipped ones; nothing to warn about.
 * · `diverged` — this db applied a migration that is in NO shipped journal entry: an applied `.sql` was
 *   edited or deleted under a live database. SINCE #316 THAT IS A BOOT REFUSAL, NOT A WIPE — the arm was
 *   called `will-reset` while the pre-launch auto-reset existed, and keeping that name past the flip would
 *   have made this tripwire print a consequence that no longer happens. The repair is a forward
 *   incremental migration, or restoring the migration the checkout deleted.
 * · `unknown` — the db could not be read (locked, corrupt, mid-write). A silence here would be a lie of
 *   the "I could not measure" kind, so it is its own arm and the caller reports it.
 */
export type DevDbResetForecast =
  | { readonly status: "no-db" }
  | { readonly status: "trivial"; readonly path: string; readonly bytes: number }
  | { readonly status: "current"; readonly path: string; readonly bytes: number }
  | { readonly status: "diverged"; readonly path: string; readonly bytes: number; readonly appliedHash: string; readonly shippedHash: string }
  | { readonly status: "unknown"; readonly path: string; readonly reason: string };

/** The applied (hash, folderMillis) read off a db FILE through a bare client — no pragmas, no drizzle. */
async function readAppliedBaselineFromFile(url: string): Promise<{ hash: string; folderMillis: number } | undefined> {
  const client = createClient({ url });
  try {
    const present = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'");
    if (present.rows.length === 0) {
      return;
    }
    const rows = await client.execute("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1");
    const row = rows.rows[0];
    if (row === undefined) {
      return;
    }
    return { hash: String(row["hash"]), folderMillis: Number(row["created_at"]) };
  } finally {
    client.close();
  }
}

/** Classify the db file at `url` against the shipped migration chain — see {@link DevDbResetForecast}. */
export async function forecastDevDbReset(url: string, migrationsFolder: string): Promise<DevDbResetForecast> {
  const path = localPath(url);
  if (path === undefined || !existsSync(path)) {
    return { status: "no-db" };
  }
  const bytes = statSync(path).size;
  if (bytes < MIN_FORECAST_BYTES) {
    return { status: "trivial", path, bytes };
  }
  let applied: { hash: string; folderMillis: number } | undefined;
  try {
    applied = await readAppliedBaselineFromFile(url);
  } catch (err) {
    return { status: "unknown", path, reason: err instanceof Error ? err.message : String(err) };
  }
  if (applied === undefined) {
    // A non-trivial file with no migrations bookkeeping is not a db this forecast can speak about.
    return { status: "unknown", path, reason: "no __drizzle_migrations row" };
  }
  const shipped = shippedMigrationChain(migrationsFolder);
  if (isShippedMigration(applied, shipped.all)) {
    return { status: "current", path, bytes };
  }
  return { status: "diverged", path, bytes, appliedHash: applied.hash, shippedHash: shipped.newest.hash };
}

// The order objects are dropped in: dependents (triggers/views/indexes) before the tables they hang off,
// so a `DROP TABLE` can't be blocked by / silently orphan a dependent. `IF EXISTS` absorbs the case where
// a table drop already cascaded its own indexes/triggers away.
const RESET_DROP_ORDER = ["trigger", "view", "index", "table"] as const;

/**
 * The reset's DDL script for a `sqlite_master` listing — pure, so the string a destructive path is about to
 * execute is unit-testable without running it (`tests/db/client.int.test.ts`).
 *
 * TWO properties it owes (#1376):
 *  · WRAPPED IN ONE TRANSACTION. `executeMultiple` is native `db.exec` with no implicit transaction
 *    (traced into `@libsql/client` 0.17.4 `sqlite3.js`), and SQLite auto-commits DDL statement by statement
 *    outside an explicit `BEGIN` — a mid-script failure left earlier DROPs committed and later ones un-run,
 *    i.e. a half-destroyed schema with no rollback. SQLite's DDL *is* transactional inside `BEGIN`.
 *    (The FK pragma is suspended by the CALLER, outside this transaction — `PRAGMA foreign_keys` is a no-op
 *    inside one.)
 *  · ESCAPED IDENTIFIERS. `sqlite_master.name` was interpolated into a quoted identifier raw, so a name
 *    containing `"` closed the identifier early and appended a second executable statement. Doubling `"` is
 *    SQLite's own escape for a quoted identifier.
 * @public Test-anchored module surface: the assertion target for a path that must never be executed to test.
 */
export function buildResetDropScript(objects: readonly Record<string, unknown>[]): string {
  const drops = RESET_DROP_ORDER.flatMap((kind) =>
    objects.filter((o) => o["type"] === kind).map((o) => `DROP ${kind} IF EXISTS "${String(o["name"]).replaceAll('"', '""')}";`),
  );
  return drops.length === 0 ? "" : ["BEGIN;", ...drops, "COMMIT;"].join("\n");
}

/**
 * Full dev-db reset on the OPEN client (the ONE connection — no file-deletion race): drop
 * EVERY user object (tables/views/triggers/indexes, INCLUDING `__drizzle_migrations`) with FK enforcement
 * toggled OFF on the connection for the duration (restored at scope exit — {@link fkEnforcementSuspended}).
 * Internal `sqlite_%` objects (autoindexes, sequence,
 * stat tables) are managed by SQLite and left alone. Dropping `__drizzle_migrations` too means the very
 * next `runMigrations` re-applies the fresh baseline from a clean bookkeeping slate. Called ONLY by the
 * boot migrate step when {@link checkBaseline} reports `regenerated` and the caller passed an explicit
 * `launched: false` — which since #316 (2026-09-18) NO production caller does: `DB_LAUNCHED` is `true`, so
 * this path is reachable only from the tests that pin the reset arm itself.
 * ATOMIC: the drops run inside the one transaction {@link buildResetDropScript} wraps them in, and a
 * mid-script failure is rolled back rather than left half-applied.
 */
export async function resetDevDatabase(db: Db): Promise<void> {
  await using _fkSuspended = await fkEnforcementSuspended(db);
  const objects = await db.all<Record<string, unknown>>(
    sql`SELECT type, name FROM sqlite_master
        WHERE type IN ('trigger', 'view', 'index', 'table') AND name NOT LIKE 'sqlite_%'`,
  );
  // One DDL script over the ONE connection (libSQL `executeMultiple`) rather than a per-object
  // round-trip loop — a single teardown, not an N+1 read path.
  const script = buildResetDropScript(objects);
  if (script.length === 0) {
    return;
  }
  const client = clientOf(db);
  try {
    await client.executeMultiple(script);
  } catch (err) {
    // `exec` stops at the failing statement and leaves the transaction OPEN; without this the connection
    // would carry a half-applied teardown into whatever the caller does next. Rolling back restores the
    // schema the boot step is about to re-migrate, and the original failure is what propagates.
    // @orb-waive caught-failure-ownership(client.execute): the rollback is best-effort BY DESIGN —
    // when no transaction is active (the BEGIN itself failed) `ROLLBACK` errors, and THAT error must not
    // mask the real one, which is rethrown on the very next line and is the owned failure. Ends if the
    // rethrow below goes away.
    await client.execute("ROLLBACK").catch(() => undefined);
    throw err;
  }
}

/** `PRAGMA optimize` — let SQLite refresh stats for the query planner. Cheap; run periodically + pre-close. */
export async function optimizeDb(db: Db): Promise<void> {
  await db.run(sql`PRAGMA optimize`);
}

// `PRAGMA wal_checkpoint` answers `(busy, log, checkpointed)`; `busy` reads back 1 when a holder blocked it.
const CHECKPOINT_BUSY = 1;

/**
 * `PRAGMA wal_checkpoint(TRUNCATE)`, reporting whether another connection blocked it. The pragma never
 * throws on a blocked checkpoint: it waits out the busy timeout, then answers `busy=1` and leaves the WAL
 * as it was. A caller about to move or copy the db file reads that answer as "someone else holds it".
 */
export async function truncateWal(db: Db): Promise<{ readonly busy: boolean }> {
  const row = await db.get<Record<string, number>>(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
  return { busy: row["busy"] === CHECKPOINT_BUSY };
}

/** Close the connection with no housekeeping — for a handle opened only to inspect or snapshot a file. */
export function closeDb(db: Db): void {
  clientOf(db).close();
}

/**
 * Optimize, truncate the WAL, then close the connection — the graceful-shutdown housekeeping.
 *
 * The close is in a `finally` (#1376): either PRAGMA can throw (a busy checkpoint, a disk error), and
 * before this that throw skipped `close()` entirely — the libSQL client leaked and the WAL stayed
 * un-checkpointed on the way out. The REJECTION is deliberately preserved: a failed checkpoint is a real
 * problem the shutdown path should report loudly (`entry/lifecycle.ts` → `entry/index.ts` exits non-zero);
 * what must not also happen is losing the handle.
 */
export async function preCloseHousekeeping(db: Db): Promise<void> {
  try {
    await optimizeDb(db);
    await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
  } finally {
    clientOf(db).close();
  }
}
