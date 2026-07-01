// entry/boot/migrate — boot step 3 (core/Tier-5-Entry.md §"Boot order"): back up the db file, run the drizzle
// migrations on the FK-OFF connection (the @orb/db front door owns the dance), then assert referential
// integrity — ABORT (throw) on any failure so a corrupting migration stays restorable from the backup.
//
// The migrations folder is resolved from the @orb/db PACKAGE's own location (the generated `0000_baseline`),
// NOT from the process cwd: `require.resolve("@orb/db")` (via `createRequire`) yields the package entry
// (`src/index.ts`) and the baseline lives in the sibling `migrations/` dir. (`createRequire`, not
// `import.meta.resolve`, because the latter is unsupported under the vitest module runner.) entry MAY import
// `@orb/db` directly (a lower package) — the migrate/backfill boot steps legitimately do. The `db` handle +
// the database URL are INJECTED (env is read once at the top boot seam and passed down; this step never
// touches `process.env`).

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Db } from "@orb/db";
import { assertReferentialIntegrity, backupBeforeMigrate, runMigrations } from "@orb/db";
import { getLog } from "#foundation/observability";

/**
 * Resolve the drizzle migrations folder shipped inside `@orb/db` (`packages/db/src/migrations`) from the
 * package's own resolved location — independent of the process cwd. `require.resolve("@orb/db")` returns the
 * `.` export target (`…/db/src/index.ts`); the baseline sits in the sibling `migrations/` directory.
 */
export function resolveMigrationsFolder(): string {
  const req = createRequire(import.meta.url);
  return join(dirname(req.resolve("@orb/db")), "migrations");
}

export interface MigrateDeps {
  readonly db: Db;
  /** The libSQL URL — backed up aside (file: URLs only; `:memory:` / not-yet-created is a no-op) before the
   *  migration so a corrupting run is restorable. */
  readonly databaseUrl: string;
  /** Override the resolved migrations folder (tests). Production omits it (resolves from `@orb/db`). */
  readonly migrationsFolder?: string;
}

/**
 * Boot step 3: `backupBeforeMigrate` → `runMigrations` (FK toggled off for the table-rebuild, restored in
 * the front door's `finally`) → `assertReferentialIntegrity` (`PRAGMA foreign_key_check`). Any failure
 * throws, aborting boot — the backup taken first is the restore point.
 */
export async function runBootMigrations(deps: MigrateDeps): Promise<void> {
  const folder = deps.migrationsFolder ?? resolveMigrationsFolder();
  const backupPath = backupBeforeMigrate(deps.databaseUrl);
  if (backupPath !== undefined) {
    getLog().info({ backupPath }, "boot/migrate: backed up db before migrating");
  }
  await runMigrations(deps.db, folder);
  await assertReferentialIntegrity(deps.db);
  getLog().info({ folder }, "boot/migrate: migrations applied; referential integrity verified");
}
