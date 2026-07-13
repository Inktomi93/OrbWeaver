// Idempotent owner provisioning: one-time `role=owner` backfill for OWNER_HANDLES, plus the AUTH_MODE=local
// first-boot password seed. There is no owner Principal at boot to call the guarded `admin.setRole`, so
// this writes the role via a direct, guarded `users` UPDATE — distinct from the runtime `setRole` grant and
// from the auth-seam fallback (in-memory only, not durable).
//
// Local password seed: a `local`-mode box behind a non-local origin has no owner-fallback, so a fresh owner
// row must be form-loginable on first boot. `initialPassword`/`hashPassword` seed it once, guarded by
// `isNull(password_hash)` so a later self-rotated password is never clobbered on reboot.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, isNull, ne } from "drizzle-orm";
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
  const seedPassword =
    deps.initialPassword !== undefined && deps.hashPassword !== undefined
      ? { plain: deps.initialPassword, hash: deps.hashPassword }
      : null;
  let passwordsSeeded = 0;
  const ids = await Promise.all(
    deps.ownerHandles.map(async (handle): Promise<UserId> => {
      const userId = await deps.sessions.ensureUser(handle);
      await deps.db
        .update(users)
        .set({ role: OWNER_ROLE, updatedAt: at })
        .where(and(eq(users.id, userId), ne(users.role, OWNER_ROLE)));
      if (seedPassword !== null && (await seedOwnerPassword(deps.db, userId, seedPassword, at))) {
        passwordsSeeded += 1;
      }
      return userId;
    }),
  );
  getLog().info({ owners: ids.length }, "boot/seed-owner: ensured OWNER_HANDLES at role=owner");
  if (passwordsSeeded > 0) {
    getLog().info(
      { owners: passwordsSeeded },
      "boot/seed-owner: seeded initial local-owner password (first boot, AUTH_MODE=local)",
    );
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
  const existing = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
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
