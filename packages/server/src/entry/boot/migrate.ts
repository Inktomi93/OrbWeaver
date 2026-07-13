// `createRequire`, not `import.meta.resolve` — the latter is unsupported under the vitest module runner.

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

// Pre-launch a baseline-hash mismatch auto-resets the dev db (data loss by design); post-launch it becomes
// boot-FATAL (never auto-wipe a launched db). Flip together with the baseline-single-migration gate.
// Widened to `boolean` (not the `false` literal) so flipping it doesn't trip a "always falsy" lint.
const LAUNCHED: boolean = false;

const HASH_LOG_PREFIX = 12;

/** Resolve the drizzle migrations folder shipped inside `@orb/db`, independent of the process cwd. */
export function resolveMigrationsFolder(): string {
  const req = createRequire(import.meta.url);
  return join(dirname(req.resolve("@orb/db")), "migrations");
}

export interface MigrateDeps {
  readonly db: Db;
  /** libSQL URL — backed up aside (file: URLs only; `:memory:`/not-yet-created is a no-op) before migrating. */
  readonly databaseUrl: string;
  /** Override the resolved migrations folder (tests). */
  readonly migrationsFolder?: string;
  /** Override the post-launch guard (tests assert the FATAL branch). */
  readonly launched?: boolean;
}

/**
 * Boot step: backup → baseline drift check → migrate → referential-integrity assert. Any failure throws,
 * aborting boot. A `regenerated` baseline drops + re-migrates pre-launch (data loss by design); post-launch
 * it's boot-FATAL instead.
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
