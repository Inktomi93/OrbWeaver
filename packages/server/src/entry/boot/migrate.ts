// `createRequire`, not `import.meta.resolve` — the latter is unsupported under the vitest module runner.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Db } from "@orb/db";
import { assertReferentialIntegrity, backupBeforeMigrate, checkBaseline, hasPendingMigrations, pruneDbBackups, resetDevDatabase, runMigrations } from "@orb/db";
import { getLog } from "#foundation/observability";

// LAUNCHED since 2026-09-18 (owner ruling on #316, Arm A — "might as well flip it"). A baseline-hash
// mismatch is now boot-FATAL on EVERY database this binary opens: the dev box's own db carries the owner's
// real corpus, and on 2026-08-19 the pre-launch arm read a hand-edited baseline as "regenerated" and
// dropped 344 characters / 895 chats / 22,784 messages at a prod boot (restored from the pre-migrate
// backup within the hour — that it was recoverable at all was luck). The switch is a CONSTANT, not
// posture-scoped: a posture-scoped flip would leave exactly the auto-wipe arm that fired, armed, on the
// one box that holds the data. Schema changes ship as forward incremental migrations from here
// (Tier-1-DB.md §"Regime 2"); its former twin, the `baseline-single-migration` gate, was DELETED in the
// same commit as its own header demanded.
// The `: boolean` annotation stays: it is the EXPORTED type every caller's `launched` key is checked
// against, so the posture remains a value the guard below reasons about rather than a literal the checker
// folds away at each call site.
//
// EXPORTED, and passed EXPLICITLY by every caller (#1392). It used to be a private fallback behind an
// optional `deps.launched`, and the production caller (`entry/lifecycle`) simply never passed the key — so
// the `??` resolved to the permissive arm on every real boot and the refusal below had never once been
// armed outside a test. Its inertness would have first mattered on the first launched deployment, at the
// exact moment nothing about the transition would make anyone look. The key is REQUIRED now: a caller that
// forgets it is a compile error, not a silent auto-wipe.
export const DB_LAUNCHED: boolean = true;

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
  /** Where the pre-migrate copies and their `.keep` pins live; the retention sweep reads the same dir. */
  readonly backupDir: string;
  /** Override the resolved migrations folder (tests). */
  readonly migrationsFolder?: string;
  /** The deployment posture, REQUIRED (#1392): `true` (what {@link DB_LAUNCHED} ships since #316) makes a
   *  divergence between the recorded and the shipped migration chain boot-FATAL; `false` buys the
   *  pre-launch auto-reset (drop + re-migrate, ALL DATA DROPPED) and survives only as the arm the reset
   *  tests drive — no production caller passes it. The required key is what makes forgetting it a compile
   *  error rather than an accidental auto-wipe. Absence at RUNTIME (an untyped caller) is fail-CLOSED:
   *  only an explicit `false` buys the reset. */
  readonly launched: boolean;
}

/**
 * Boot step: baseline drift check → backup (only if this boot will CHANGE the db) → migrate →
 * referential-integrity assert → backup retention sweep. Any failure throws, aborting boot. A
 * `regenerated` baseline — the db recorded a migration that is not in the shipped chain — is boot-FATAL
 * under {@link DB_LAUNCHED}; only an explicit `launched: false` still drops + re-migrates.
 *
 * The backup is conditional because the overwhelmingly common boot is a NO-OP one (every dev-stack /
 * lane restart re-runs this step with nothing pending) and each backup is a full copy of the db — the
 * unconditional copy grew `data/` to 3.2k backups / 150GB. The backup-before-change guarantee is
 * unchanged: everything that mutates the db (a pending migration, or the regenerated-baseline reset)
 * still copies aside first. `checkBaseline`/`hasPendingMigrations` are read-only, so running them first
 * cannot be the change the backup is meant to protect.
 */
export async function runBootMigrations(deps: MigrateDeps): Promise<void> {
  const folder = deps.migrationsFolder ?? resolveMigrationsFolder();
  const baseline = await checkBaseline(deps.db, folder);
  // The launched-db refusal comes BEFORE the backup: a boot that is going to abort has no db change to
  // protect, and each backup is a full copy.
  // `!== false`, not a truthiness read: the destructive arm is bought ONLY by an EXPLICIT `launched: false`.
  // The key is required, so a typed caller cannot omit it; this is the runtime floor for an untyped one
  // (#1392 — the omission that made this whole guard inert was exactly that shape).
  if (baseline.status === "regenerated" && deps.launched !== false) {
    throw new Error(
      `boot/migrate: this LAUNCHED database recorded migration ${baseline.appliedHash.slice(0, HASH_LOG_PREFIX)}…, which is in no entry of the shipped migration chain (newest: ${baseline.currentHash.slice(0, HASH_LOG_PREFIX)}…) — refusing to auto-wipe a launched db. An applied migration is never edited or deleted; ship a forward incremental migration instead (a squash-reset would destroy live data).`,
    );
  }
  const willChange = baseline.status === "regenerated" || (await hasPendingMigrations(deps.db, folder));
  if (willChange) {
    const backupPath = await backupBeforeMigrate(deps.db, deps.databaseUrl, deps.backupDir);
    if (backupPath !== undefined) {
      getLog().info({ backupPath }, "boot/migrate: backed up db before migrating");
    }
  }
  if (baseline.status === "regenerated") {
    getLog().warn(
      { appliedHash: baseline.appliedHash, currentHash: baseline.currentHash },
      "boot/migrate: BASELINE REGENERATED since this dev db was created — RESETTING the dev database (ALL DATA DROPPED, pre-launch by design) and re-migrating from the fresh 0000_baseline",
    );
    await resetDevDatabase(deps.db);
  }
  await runMigrations(deps.db, folder);
  await assertReferentialIntegrity(deps.db);
  getLog().info({ folder }, "boot/migrate: migrations applied; referential integrity verified");
  // Retention runs only on the boots that took a backup — a no-op boot touches the db directory not at all.
  if (willChange) {
    const pruned = pruneDbBackups(deps.databaseUrl, deps.backupDir);
    if (pruned.length > 0) {
      getLog().info({ pruned: pruned.length }, "boot/migrate: pruned stale db backups");
    }
  }
}
