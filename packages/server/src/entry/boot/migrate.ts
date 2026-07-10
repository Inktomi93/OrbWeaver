// entry/boot/migrate — boot step 3 (core/Tier-5-Entry.md §"Boot order"). See `runBootMigrations` for the
// sequence and `resolveMigrationsFolder` for how the migrations dir is located.
//
// `createRequire`, not `import.meta.resolve`, because the latter is unsupported under the vitest module
// runner. entry MAY import `@orb/db` directly (a lower package) — the migrate/backfill boot steps
// legitimately do. The `db` handle + the database URL are INJECTED (env is read once at the top boot seam
// and passed down; this step never touches `process.env`).

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Db } from "@orb/db";
import {
  assertReferentialIntegrity,
  backupBeforeMigrate,
  checkBaseline,
  resetDevDatabase,
  runMigrations,
} from "@orb/db";
import { getLog } from "#foundation/observability";

// Pairs with the `baseline-single-migration` gate's LAUNCHED switch (scripts/check/gates/
// baseline-single-migration.ts) — flip BOTH together on launch day. Pre-launch the schema is ONE
// regenerated baseline, so a dev db whose recorded baseline hash no longer matches the shipped one was
// simply built from an older squash: auto-reset + re-migrate (the data loss is BY DESIGN pre-launch — the
// onboarding latch dies with it, so re-seeding happens naturally). Post-launch a mismatch instead becomes
// boot-FATAL: a launched db carries real user data and must NEVER be auto-wiped — it gets a forward
// incremental migration, not a squash-reset. Widened to `boolean` (not the `false` literal) so flipping it
// to `true` doesn't trip a "condition always falsy" lint — the annotation is the deliberate escape hatch.
const LAUNCHED: boolean = false;

// Enough sha256 hex to disambiguate two baselines in the fatal message without dumping the full 64 chars.
const HASH_LOG_PREFIX = 12;

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
  /** Override the post-launch guard (tests assert the FATAL branch). Production omits it → the module
   *  {@link LAUNCHED} constant, which pairs with the `baseline-single-migration` gate's switch. */
  readonly launched?: boolean;
}

/**
 * Boot step 3: `backupBeforeMigrate` → baseline drift check ({@link checkBaseline}) → `runMigrations` (FK
 * toggled off for the table-rebuild, restored in the front door's `finally`) → `assertReferentialIntegrity`
 * (`PRAGMA foreign_key_check`). Any failure throws, aborting boot — the backup taken first is the restore
 * point.
 *
 * The drift check closes the pre-launch squash-regen trap: regenerating `0000_baseline.sql` changes its
 * hash + journal `when`, so drizzle's migrator would decide the baseline is unapplied and RE-RUN it over
 * the existing tables, dying on `table X already exists`. On a `regenerated` dev db we drop everything +
 * re-migrate from the fresh baseline (loud log; data loss BY DESIGN pre-launch). Post-launch ({@link
 * LAUNCHED}) the same drift is boot-FATAL — a real user db is never auto-wiped.
 */
export async function runBootMigrations(deps: MigrateDeps): Promise<void> {
  const folder = deps.migrationsFolder ?? resolveMigrationsFolder();
  const backupPath = backupBeforeMigrate(deps.databaseUrl);
  if (backupPath !== undefined) {
    getLog().info({ backupPath }, "boot/migrate: backed up db before migrating");
  }
  const baseline = await checkBaseline(deps.db, folder);
  if (baseline.status === "regenerated") {
    if (deps.launched ?? LAUNCHED) {
      throw new Error(
        `boot/migrate: the shipped 0000_baseline (${baseline.currentHash.slice(0, HASH_LOG_PREFIX)}…) differs from what this LAUNCHED database recorded (${baseline.appliedHash.slice(0, HASH_LOG_PREFIX)}…) — refusing to auto-wipe a launched db. Ship a forward incremental migration instead (a squash-reset would destroy live data).`,
      );
    }
    getLog().warn(
      { appliedHash: baseline.appliedHash, currentHash: baseline.currentHash },
      "boot/migrate: BASELINE REGENERATED since this dev db was created — RESETTING the dev database (ALL DATA DROPPED, pre-launch by design) and re-migrating from the fresh 0000_baseline",
    );
    await resetDevDatabase(deps.db);
  }
  await runMigrations(deps.db, folder);
  await assertReferentialIntegrity(deps.db);
  getLog().info({ folder }, "boot/migrate: migrations applied; referential integrity verified");
}
