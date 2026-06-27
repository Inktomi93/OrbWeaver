// client.ts — the libSQL client, the PRAGMA discipline, the migration runner, and the lifecycle helpers.
// This is the ONE place that constructs a connection and owns the FK dance (db.md esoteric #5 + §5).
//
// The OTel tracing wrapper is INJECTED (`wrap`), never imported: `@orb/db` cannot import `@orb/server`
// (the cake), so `server/observability` passes its wrapper IN at `createDb`. node:fs/node:url are
// sanctioned here for the NON-OPTIONAL pre-migration backup (db.md "backupBeforeMigrate").

import { copyFileSync, existsSync, statSync } from "node:fs";
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
 * The OTel injection seam: `server/observability` passes a wrapper that decorates the libSQL client with
 * tracing. db never imports observability — the wrapper arrives here. Identity when omitted.
 */
export type LibSqlWrap = (client: Client) => Client;

// `PRAGMA foreign_keys` reads back 1 when enforcement is ON.
const FK_ENABLED = 1;
const FILE_SCHEME = "file:";

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
 * Construct the db. Sets `PRAGMA foreign_keys = ON` on the connection AND reads it back — REFUSING to
 * boot if it didn't stick (SQLite defaults FK enforcement OFF and the schema is FK-dense, so a silent
 * OFF would let orphan writes through). The optional `wrap` decorates the client (OTel) before drizzle
 * binds it.
 */
export async function createDb(url: string, wrap?: LibSqlWrap): Promise<Db> {
  const base = createClient({ url });
  const client = wrap === undefined ? base : wrap(base);
  await client.execute("PRAGMA foreign_keys = ON");
  const readback = await client.execute("PRAGMA foreign_keys");
  const value = readback.rows[0]?.["foreign_keys"];
  if (value !== FK_ENABLED) {
    throw new Error(
      `@orb/db: PRAGMA foreign_keys did not stick (read back ${String(value)}); refusing to boot — the FK-dense schema requires enforcement ON.`,
    );
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
