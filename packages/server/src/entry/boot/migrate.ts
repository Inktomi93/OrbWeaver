// `createRequire`, not `import.meta.resolve` — the latter is unsupported under the vitest module runner.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Db } from "@orb/db";
import { assertReferentialIntegrity, backupBeforeMigrate, checkBaseline, hasPendingMigrations, pruneDbBackups, runMigrations } from "@orb/db";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";

const HASH_LOG_PREFIX = 12;

/** Resolve the drizzle migrations folder shipped inside `@orb/db`, independent of the process cwd. */
function resolveMigrationsFolder(): string {
  const req = createRequire(import.meta.url);
  return join(dirname(req.resolve("@orb/db")), "migrations");
}

export interface MigrateDeps {
  readonly logger: Logger;
  readonly db: Db;
  /** libSQL URL — backed up aside (file: URLs only; `:memory:`/not-yet-created is a no-op) before migrating. */
  readonly databaseUrl: string;
  /** Where the pre-migrate copies and their `.keep` pins live; the retention sweep reads the same dir. */
  readonly backupDir: string;
  /** Override the resolved migrations folder (tests). */
  readonly migrationsFolder?: string;
}

/**
 * Boot step: baseline drift check → backup (only if this boot will CHANGE the db) → migrate →
 * referential-integrity assert → backup retention sweep. Any failure throws, aborting boot. A
 * `regenerated` baseline — the db recorded a migration that is not in the shipped chain — is boot-FATAL
 * for every database: schema changes ship as forward migrations (D163), and boot never resets a database.
 *
 * The backup is conditional because the overwhelmingly common boot is a NO-OP one (every dev-stack /
 * lane restart re-runs this step with nothing pending) and each backup is a full copy of the db — the
 * unconditional copy grew `data/` to 3.2k backups / 150GB. The backup-before-change guarantee is
 * unchanged: a pending migration still copies aside first. `checkBaseline`/`hasPendingMigrations` are
 * read-only, so running them first cannot be the change the backup is meant to protect.
 */
export async function runBootMigrations(deps: MigrateDeps): Promise<void> {
  const folder = deps.migrationsFolder ?? resolveMigrationsFolder();
  const baseline = await checkBaseline(deps.db, folder);
  // The refusal comes BEFORE the backup: a boot that is going to abort has no db change to protect, and each
  // backup is a full copy.
  if (baseline.status === "regenerated") {
    throw new Error(
      `boot/migrate: this database recorded migration ${baseline.appliedHash.slice(0, HASH_LOG_PREFIX)}…, which is in no entry of the shipped migration chain (newest: ${baseline.currentHash.slice(0, HASH_LOG_PREFIX)}…) — refusing to auto-wipe it. An applied migration is never edited or deleted; ship a forward incremental migration instead (a squash-reset would destroy live data).`,
    );
  }
  const willChange = await hasPendingMigrations(deps.db, folder);
  if (willChange) {
    const backupPath = await backupBeforeMigrate(deps.db, deps.databaseUrl, deps.backupDir);
    if (backupPath !== undefined) {
      getLog(deps.logger).info({ backupPath }, "boot/migrate: backed up db before migrating");
    }
  }
  await runMigrations(deps.db, folder);
  await assertReferentialIntegrity(deps.db);
  getLog(deps.logger).info({ folder }, "boot/migrate: migrations applied; referential integrity verified");
  // Retention runs only on the boots that took a backup — a no-op boot touches the db directory not at all.
  if (willChange) {
    const pruned = pruneDbBackups(deps.databaseUrl, deps.backupDir);
    if (pruned.length > 0) {
      getLog(deps.logger).info({ pruned: pruned.length }, "boot/migrate: pruned stale db backups");
    }
  }
}
