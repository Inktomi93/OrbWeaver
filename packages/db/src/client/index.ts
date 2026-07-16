// client.ts — the libSQL client, the PRAGMA discipline, the migration runner, and the lifecycle helpers.
// This is the ONE place that constructs a connection and owns the FK dance (Tier-1-DB.md esoteric #5 + §5).
//
// The OTel tracing wrapper is INJECTED (`wrap`), never imported: `@orb/db` cannot import `@orb/server`
// (the cake), so `server/observability` passes its wrapper IN at `createDb`. node:fs/node:url are
// sanctioned here for the NON-OPTIONAL pre-migration backup (Tier-1-DB.md "backupBeforeMigrate").

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "@libsql/client";
import { createClient } from "@libsql/client";
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
 * types `db` as `ReadOnlyDb` gets a COMPILE-TIME guarantee it cannot issue a write (PD-102) — `tsc` fails
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

// Per-connection tuning, set at every createDb. journal_mode goes first — the others assume WAL.
// busy_timeout is load-bearing: the workloads worker races HTTP request writes, and without a wait a
// concurrent write throws SQLITE_BUSY immediately instead of retrying for up to 5s. synchronous=NORMAL
// is the safe-under-WAL fsync level; cache_size/mmap_size/temp_store are throughput. libSQL honors all
// six (readback: mmap_size floors to a page boundary, busy_timeout reads back under the `timeout` column).
const TUNING_PRAGMAS = [
  "journal_mode = WAL",
  "busy_timeout = 5000",
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

// The on-disk path for a `file:` URL (for the backup), or undefined for `:memory:` / non-file URLs.
function localPath(url: string): string | undefined {
  if (!url.startsWith(FILE_SCHEME)) {
    return;
  }
  try {
    return fileURLToPath(url); // file:// and file:/abs
  } catch {
    return url.slice(FILE_SCHEME.length); // file:relative.db
  }
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
  const base = createClient({ url });
  const client = wrap === undefined ? base : wrap(base);
  await client.execute("PRAGMA foreign_keys = ON");
  const readback = await client.execute("PRAGMA foreign_keys");
  const value = readback.rows[0]?.["foreign_keys"];
  if (value !== FK_ENABLED) {
    throw new Error(`@orb/db: PRAGMA foreign_keys did not stick (read back ${String(value)}); refusing to boot — the FK-dense schema requires enforcement ON.`);
  }
  for (const pragma of TUNING_PRAGMAS) {
    // biome-ignore lint/performance/noAwaitInLoops: PRAGMAs must apply sequentially in order — journal_mode = WAL first, the rest assume it; Promise.all would race the mode switch.
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
 * Copy the db file aside BEFORE migrating (NON-OPTIONAL — `assertReferentialIntegrity` is the only
 * post-migration FK gate, so a corrupting migration must be restorable). No-op for `:memory:` / a
 * not-yet-created db. The backup is suffixed with the db's last-write time (fs metadata, not a wall
 * clock) so it names the exact state it captures. Returns the backup path, or undefined if none.
 */
export function backupBeforeMigrate(url: string): string | undefined {
  const path = localPath(url);
  if (path === undefined || !existsSync(path)) {
    return;
  }
  const stamp = Math.round(statSync(path).mtimeMs);
  const backupPath = `${path}.backup-${stamp}`;
  copyFileSync(path, backupPath);
  return backupPath;
}

/**
 * Run drizzle migrations with FK enforcement toggled OFF on the CONNECTION for the duration. drizzle's
 * 12-step table rebuild DROPs + recreates tables; with FKs ON, a `DROP TABLE parent` silently
 * cascade-DELETEs a populated db. The in-FILE `PRAGMA foreign_keys=OFF` is a no-op (libSQL batches the
 * migration as one tx and ignores mid-tx toggles) — only the connection-level toggle works. Restored to
 * ON in `finally` so a failed migration still leaves enforcement on.
 */
export async function runMigrations(db: Db, migrationsFolder: string): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.run(sql`PRAGMA foreign_keys = ON`);
  }
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
 * The pre-launch baseline drift check. Compares what THIS db recorded in `__drizzle_migrations` (the
 * `hash` + `created_at` = folderMillis drizzle's own migrator writes) against the shipped
 * `0000_baseline.sql` (sha256 of the file + the journal `when`), computed identically to drizzle so a
 * byte-identical baseline compares equal. Pre-launch the schema is ONE regenerated baseline (the
 * `baseline-single-migration` gate enforces it), so any drift means the baseline was regenerated since
 * this db was built — drizzle would then RE-APPLY it over existing tables and die on a "table already
 * exists" error. `entry/boot/migrate.ts` reads this to decide reset-vs-fatal.
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

// The shipped baseline's identity, computed EXACTLY as drizzle's `readMigrationFiles` records it: sha256
// of the raw `<tag>.sql` bytes + the journal entry's `when`. Pre-launch the journal holds one entry (the
// baseline); `.at(-1)` reads it without hard-coding the tag.
function shippedBaselineIdentity(migrationsFolder: string): { hash: string; folderMillis: number } {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta", "_journal.json"), "utf-8")) as {
    entries?: readonly { readonly when: number; readonly tag: string }[];
  };
  const entry = journal.entries?.at(-1);
  if (entry === undefined) {
    throw new Error("@orb/db: migrations journal has no entries — cannot compute baseline identity");
  }
  const sqlText = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), "utf-8");
  return { hash: createHash("sha256").update(sqlText).digest("hex"), folderMillis: entry.when };
}

/** Classify this db against the shipped baseline (see {@link BaselineCheck}). */
export async function checkBaseline(db: Db, migrationsFolder: string): Promise<BaselineCheck> {
  const applied = await readAppliedBaseline(db);
  if (applied === undefined) {
    return { status: "fresh" };
  }
  const shipped = shippedBaselineIdentity(migrationsFolder);
  if (applied.hash === shipped.hash && applied.folderMillis === shipped.folderMillis) {
    return { status: "current" };
  }
  return { status: "regenerated", appliedHash: applied.hash, currentHash: shipped.hash };
}

// The order objects are dropped in: dependents (triggers/views/indexes) before the tables they hang off,
// so a `DROP TABLE` can't be blocked by / silently orphan a dependent. `IF EXISTS` absorbs the case where
// a table drop already cascaded its own indexes/triggers away.
const RESET_DROP_ORDER = ["trigger", "view", "index", "table"] as const;

/**
 * Full pre-launch dev-db reset on the OPEN client (the ONE connection — no file-deletion race): drop
 * EVERY user object (tables/views/triggers/indexes, INCLUDING `__drizzle_migrations`) with FK enforcement
 * toggled OFF on the connection for the duration. Internal `sqlite_%` objects (autoindexes, sequence,
 * stat tables) are managed by SQLite and left alone. Dropping `__drizzle_migrations` too means the very
 * next `runMigrations` re-applies the fresh baseline from a clean bookkeeping slate. Called ONLY by the
 * boot migrate step when {@link checkBaseline} reports `regenerated` and the db is not launched.
 */
export async function resetDevDatabase(db: Db): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys = OFF`);
  try {
    const objects = await db.all<Record<string, unknown>>(
      sql`SELECT type, name FROM sqlite_master
          WHERE type IN ('trigger', 'view', 'index', 'table') AND name NOT LIKE 'sqlite_%'`,
    );
    // One DDL script over the ONE connection (libSQL `executeMultiple`) rather than a per-object
    // round-trip loop — a single teardown, not an N+1 read path.
    const script = RESET_DROP_ORDER.flatMap((kind) =>
      objects.filter((o) => o["type"] === kind).map((o) => `DROP ${kind} IF EXISTS "${String(o["name"])}";`),
    ).join("\n");
    if (script.length > 0) {
      await clientOf(db).executeMultiple(script);
    }
  } finally {
    await db.run(sql`PRAGMA foreign_keys = ON`);
  }
}

/** `PRAGMA optimize` — let SQLite refresh stats for the query planner. Cheap; run periodically + pre-close. */
export async function optimizeDb(db: Db): Promise<void> {
  await db.run(sql`PRAGMA optimize`);
}

/** Optimize, truncate the WAL, then close the connection — the graceful-shutdown housekeeping. */
export async function preCloseHousekeeping(db: Db): Promise<void> {
  await optimizeDb(db);
  await db.run(sql`PRAGMA wal_checkpoint(TRUNCATE)`);
  clientOf(db).close();
}
