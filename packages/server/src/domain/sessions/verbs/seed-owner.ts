// Trusted boot owner provisioning preserves the guarded durable backfill without inventing a Principal.
// Private users persistence owns the SQL; ordinary runtime role changes still require admin authority.

import type { Db } from "@orb/db";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { SeedOwnerContext, SeedOwnerParams } from "../contract/boot.ts";
import {
  backfillBootstrapOwner,
  claimBootstrapPassword,
  selectBootstrapHandleConflict,
  selectBootstrapOwner,
  selectBootstrapPasswordHash,
} from "../persistence/users.ts";

/**
 * Reconcile a MOVED `OWNER_HANDLES`: rename the existing owner row onto the new seed key so the rest of boot
 * (and the auth seam's owner fallback) can resolve the owner ROW through it again. A no-op on first boot (no
 * owner row yet) and on every ordinary boot (the row already holds the key).
 *
 * WHY A RENAME IS THE RIGHT ANSWER HERE, where the sibling impostor case is deliberately manual
 * (`provision-identity`, owner-ruled 2026-08-08): that refusal exists because a re-issued SSO subject arrives
 * OFF THE WIRE and is indistinguishable from an attacker's. `OWNER_HANDLES` is ENV — trusted config at the
 * same tier as `SESSION_SECRET`/`DATABASE_URL`, writable only by whoever already owns the box. There is no
 * adversary in this path, so the ambiguity that justifies a manual repair there does not exist here.
 *
 * WHAT IT WILL NOT DO. It never STEALS: a seed key some other user already holds is a refusal, loud and
 * actionable, with both rows untouched (`users_handle_key_unique` would reject the write anyway — this turns an
 * opaque SQLITE_CONSTRAINT into a message that names the choice). It never touches `role`, `external_id`,
 * `password_hash` or `enabled` — only the handle moves, so the owner's durable SSO binding survives the
 * migration and the D17 singleton is never a second owner row. And it is LOUD: the warn line is the
 * operator's tell that a typo'd `OWNER_HANDLES` just renamed their owner (reverting the env renames it back —
 * the row is identified by `role='owner'`, not by the handle it happens to carry).
 */
async function adoptMovedSeedKey(deps: SeedOwnerContext, seedKey: Handle, at: number): Promise<void> {
  const { db } = deps;
  const owner = await selectBootstrapOwner(db);
  if (owner === undefined || owner.handle === seedKey) {
    return;
  }
  // "Held by SOMEONE ELSE", not merely "held": a concurrently-booting replica may have already migrated this
  // very row, and reporting that as a stolen handle would fail a healthy boot on a lie.
  const taken = await selectBootstrapHandleConflict(db, seedKey, owner.id);
  if (taken !== undefined) {
    throw new Error(
      `seedOwner: OWNER_HANDLES moved to "${seedKey}", but that handle or a look-alike of it (one handle key, D257) is already held by another user (id=${taken}) — refusing to rename the owner row (id=${owner.id}, handle="${owner.handle}") onto it, which would take a member's handle. Point OWNER_HANDLES at an unused handle, or rename/remove that user first.`,
    );
  }
  await deps.sessions.renameUserHandle(owner.id, seedKey, at);
  getLog().warn(
    { ownerId: owner.id, from: owner.handle, to: seedKey },
    "boot/seed-owner: OWNER_HANDLES moved — renamed the owner row onto the new seed key (role + external_id unchanged; if this was a typo, restore OWNER_HANDLES and reboot)",
  );
}

/** Ensure every OWNER handle has a `users` row at `role=owner`. Returns the ensured owner `UserId`s in
 *  OWNER_HANDLES order. Idempotent: a row already at `owner` is left untouched. */
async function seedOwner(deps: SeedOwnerContext): Promise<readonly UserId[]> {
  // D17: exactly one owner. env already boot-rejects a multi-handle OWNER_HANDLES; this is the belt.
  if (deps.ownerHandles.length > 1) {
    throw new Error(
      `seedOwner: refusing to seed ${deps.ownerHandles.length} owners (D17: the box has EXACTLY ONE owner) — OWNER_HANDLES must name one handle: ${deps.ownerHandles.join(", ")}`,
    );
  }
  const at = deps.now();
  // BEFORE the ensure loop: it resolves the owner BY HANDLE, so a stale key would send it down the
  // insert-then-collide path that made a moved OWNER_HANDLES a fatal boot.
  const seedKey = deps.ownerHandles[0];
  if (seedKey !== undefined) {
    await adoptMovedSeedKey(deps, castId<Handle>(seedKey), at);
  }
  const seedPassword = deps.initialPassword !== undefined && deps.hashPassword !== undefined ? { plain: deps.initialPassword, hash: deps.hashPassword } : null;
  let passwordsSeeded = 0;
  const ids = await Promise.all(
    deps.ownerHandles.map(async (handle): Promise<UserId> => {
      const userId = await deps.sessions.ensureUser(castId<Handle>(handle));
      // Boot invariant: the owner row is always role=owner AND enabled. `enabled:true` self-heals a
      // disabled owner (a raw-write brick with no in-app exit — admin.setEnabled refuses the owner row).
      // The WHERE must fire on an ALREADY-owner-but-disabled row too, so it widens past the role backfill
      // to `enabled = false`; still a no-op (0 rows) on a healthy owner+enabled row.
      await backfillBootstrapOwner(deps.db, userId, at);
      if (seedPassword !== null && (await seedOwnerPassword(deps.db, userId, seedPassword, at))) {
        passwordsSeeded += 1;
      }
      return userId;
    }),
  );
  getLog().info({ owners: ids.length }, "boot/seed-owner: ensured OWNER_HANDLES at role=owner");
  if (passwordsSeeded > 0) {
    getLog().info({ owners: passwordsSeeded }, "boot/seed-owner: seeded initial local-owner password (first boot, AUTH_MODE=local)");
  }
  return ids;
}

/** First-boot local-password backfill for ONE owner row. Returns whether a hash was written. */
async function seedOwnerPassword(
  db: Db,
  userId: UserId,
  seed: { readonly plain: string; readonly hash: (plain: string) => Promise<string> },
  at: number,
): Promise<boolean> {
  const currentHash = await selectBootstrapPasswordHash(db, userId);
  if (currentHash !== null && currentHash !== undefined) {
    return false;
  }
  const passwordHash = await seed.hash(seed.plain);
  return await claimBootstrapPassword(db, userId, passwordHash, at);
}

/** Build the trusted pre-compose owner bootstrap operation. */
export function createSeedOwner(deps: SeedOwnerParams): () => Promise<readonly UserId[]> {
  const ctx: SeedOwnerContext = { ...deps, db: databaseForOwner(deps.db) };
  return () => seedOwner(ctx);
}
