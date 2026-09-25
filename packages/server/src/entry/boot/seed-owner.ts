// Idempotent owner provisioning: the MOVED-seed-key reconcile, the one-time `role=owner` backfill for
// OWNER_HANDLES, and the AUTH_MODE=local first-boot password seed. There is no owner Principal at boot to
// call the guarded `admin.setRole`, so this writes the role via a direct, guarded `users` UPDATE — distinct
// from the runtime `setRole` grant and from the auth-seam fallback (in-memory only, not durable).
//
// THE OWNER ROW'S HANDLE MUST BE THE OWNER_HANDLES SEED KEY, and this step is what makes that true. Two
// consumers resolve the owner ROW by that handle rather than by id — this seed (`ensureUser(handle)`) and the
// auth seam's owner fallback (`ownerHandleForFallback` → `ensureUser`) — so an operator who edits
// OWNER_HANDLES has moved the only key either one has, and a box that boots with the row still on the OLD key
// is broken at BOTH (`seedOwner` dies on the single-owner UNIQUE; every fallback request would die the same
// way). `adoptMovedSeedKey` migrates the row instead, which is also what makes `provision-identity`'s
// "an operator who MOVES OWNER_HANDLES is migrating the key" a promise something actually keeps.
//
// Local password seed (OPTIONAL since B4): when `LOCAL_INITIAL_PASSWORD` is set, `initialPassword`/
// `hashPassword` seed the owner's password once, guarded by `isNull(password_hash)` so a later self-rotated
// password is never clobbered on reboot. When it is UNSET, the owner row is left passwordless and the in-app
// first-run setup (`POST /api/auth/first-run`, local-origin-gated, one-shot on that same null) claims it on
// first visit — the path a public-origin local deploy still covers with `LOCAL_INITIAL_PASSWORD` (no
// owner-fallback there, and first-run is local-origin only).

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import type { SessionsService } from "#domain/sessions";
import { getLog } from "#foundation/observability";

const OWNER_ROLE = "owner" as const;

export interface SeedOwnerDeps {
  readonly db: Db;
  readonly sessions: Pick<SessionsService, "ensureUser">;
  readonly ownerHandles: readonly string[];
  readonly now: () => number;
  /** AUTH_MODE=local only: the cleartext first-boot owner password. Never logged. */
  readonly initialPassword?: string;
  /** Present iff `initialPassword` is. Injected, not constructed here — infra/auth is the sole hashing home. */
  readonly hashPassword?: (plain: string) => Promise<string>;
}

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
async function adoptMovedSeedKey(db: Db, seedKey: Handle, at: number): Promise<void> {
  const [owner] = await db.select({ id: users.id, handle: users.handle }).from(users).where(eq(users.role, OWNER_ROLE)).limit(1);
  if (owner === undefined || owner.handle === seedKey) {
    return;
  }
  // "Held by SOMEONE ELSE", not merely "held": a concurrently-booting replica may have already migrated this
  // very row, and reporting that as a stolen handle would fail a healthy boot on a lie.
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handleKey, handleKey(seedKey)), ne(users.id, owner.id)))
    .limit(1);
  if (taken !== undefined) {
    throw new Error(
      `seedOwner: OWNER_HANDLES moved to "${seedKey}", but that handle or a look-alike of it (one handle key, ADR 0254) is already held by another user (id=${taken.id}) — refusing to rename the owner row (id=${owner.id}, handle="${owner.handle}") onto it, which would take a member's handle. Point OWNER_HANDLES at an unused handle, or rename/remove that user first.`,
    );
  }
  await db
    .update(users)
    .set({ handle: seedKey, handleKey: handleKey(seedKey), updatedAt: at })
    .where(eq(users.id, owner.id));
  getLog().warn(
    { ownerId: owner.id, from: owner.handle, to: seedKey },
    "boot/seed-owner: OWNER_HANDLES moved — renamed the owner row onto the new seed key (role + external_id unchanged; if this was a typo, restore OWNER_HANDLES and reboot)",
  );
}

/** Ensure every OWNER handle has a `users` row at `role=owner`. Returns the ensured owner `UserId`s in
 *  OWNER_HANDLES order. Idempotent: a row already at `owner` is left untouched. */
export async function seedOwner(deps: SeedOwnerDeps): Promise<readonly UserId[]> {
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
    await adoptMovedSeedKey(deps.db, castId<Handle>(seedKey), at);
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
      await deps.db
        .update(users)
        .set({ role: OWNER_ROLE, enabled: true, updatedAt: at })
        .where(and(eq(users.id, userId), or(ne(users.role, OWNER_ROLE), eq(users.enabled, false))));
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
  const existing = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  const currentHash = existing.at(0)?.passwordHash;
  if (currentHash !== null && currentHash !== undefined) {
    return false;
  }
  const passwordHash = await seed.hash(seed.plain);
  const result = await db
    .update(users)
    .set({ passwordHash, updatedAt: at })
    .where(and(eq(users.id, userId), isNull(users.passwordHash)));
  return result.rowsAffected > 0;
}
