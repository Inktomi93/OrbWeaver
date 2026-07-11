// entry/boot/seed-owner — boot step 4: idempotent owner provisioning (core/Tier-5-Entry.md §"Boot order"; spine
// Spine-Identity-and-Auth.md §3 "Construction" — the one-time `role=owner` backfill for OWNER_HANDLES, plus the
// AUTH_MODE=local first-boot password seed).
//
// THE CHICKEN-EGG: there is no owner Principal at boot to call the GUARDED `admin.setRole` (which itself
// requires `requireOwner`), so the owner role must be written by a PRIVILEGED boot path. entry MAY import
// `@orb/db` directly, so this step writes the role via a direct, guarded `users` UPDATE — the sanctioned
// boot-only backfill the spine names. It is distinct from `setRole` (the runtime, owner-gated grant) and
// distinct from the auth-seam fallback (which mints an in-memory `role:"owner"` Principal but does not make
// the row durable — that durability is THIS step's job).
//
// For each OWNER handle: `sessions.ensureUser(handle)` (JIT-create the row, no role derivation) then backfill
// `role=owner` IF NOT ALREADY owner. The `ne(role, 'owner')` guard makes a re-run change 0 rows (idempotent)
// and leaves an already-owner row's `updated_at` untouched. `now` is injected (determinism). Respects D17:
// the owner is the bootstrap identity (handles come from OWNER_HANDLES, resolved at the top boot seam).
//
// LOCAL PASSWORD SEED (AUTH_MODE=local): a `local`-mode box behind a NON-local origin has no owner-fallback
// (the AUTH_FALLBACK=owner seam is origin-gated), so a fresh owner row must be FORM-loginable or the box locks
// out on first boot. When the caller passes `initialPassword` + the ONE `hashPassword` seam (both iff
// AUTH_MODE=local with LOCAL_INITIAL_PASSWORD set — see lifecycle), each seeded owner whose `password_hash` is
// still NULL gets the initial password hashed (scrypt+pepper via infra/auth — never a second hashing home) and
// stored. NON-CLOBBERING + idempotent: the `isNull(password_hash)` WHERE guard (same spirit as the `ne(role,
// 'owner')` guard) means an owner who later rotated their password is NEVER reset to the env value on a reboot,
// and the KDF is only run on the first boot (we read the row first, so a re-boot burns no scrypt). The cleartext
// is hashed and dropped — it is NEVER logged (the boot log carries only a count). oidc/forward-header owners
// authenticate via the IdP/proxy and are never passed an initial password. D17 (triple-enforced: env
// superRefine + the `> 1` guard below + `users_single_owner_unique`) means there is only ever ONE owner handle;
// the per-handle loop applies the policy "every not-yet-passworded owner handle gets the initial password".

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, isNull, ne } from "drizzle-orm";
import type { SessionsService } from "#domain/sessions";
import { getLog } from "#foundation/observability";

const OWNER_ROLE = "owner" as const;

export interface SeedOwnerDeps {
  readonly db: Db;
  /** The sessions front door — only the JIT row-resolver is needed. */
  readonly sessions: Pick<SessionsService, "ensureUser">;
  /** OWNER handles, already resolved at the top boot seam (OWNER_HANDLES, defaulting to
   *  [DEFAULT_USER_HANDLE] upstream). Each is ensured + backfilled to `role=owner`. */
  readonly ownerHandles: readonly string[];
  /** Injected clock for the `updated_at` stamp on a backfilled row (determinism — `no-raw-clock`). */
  readonly now: () => number;
  /** AUTH_MODE=local only: `env.LOCAL_INITIAL_PASSWORD`, the cleartext first-boot owner password. Passed
   *  alongside `hashPassword` ONLY in local mode (undefined ⇒ no password seed — the single-user / SSO paths).
   *  Seeded exactly once per owner (guarded on `password_hash IS NULL`); NEVER logged. */
  readonly initialPassword?: string;
  /** The ONE local-password hashing seam (`createPasswordHasher(SESSION_SECRET).hash` — scrypt + pepper +
   *  per-user salt). Injected, not constructed here — infra/auth is the sole hashing home. Present iff
   *  `initialPassword` is. */
  readonly hashPassword?: (plain: string) => Promise<string>;
}

/**
 * Boot step 4: ensure every OWNER handle has a `users` row at `role=owner`. Returns the ensured owner
 * `UserId`s in OWNER_HANDLES order (the top boot seam builds the owner `Principal` from the first — the
 * deployment owner that funds the box-global services + the env credential seed). Idempotent: a row already
 * at `owner` is left untouched.
 */
export async function seedOwner(deps: SeedOwnerDeps): Promise<readonly UserId[]> {
  // D17: the box has EXACTLY ONE owner. `foundation/env` already boot-rejects a multi-handle OWNER_HANDLES,
  // so this is the belt at the backfill seam — fail fast with the D17 message rather than loop the second
  // handle into a raw `users_single_owner_unique` violation (a cryptic boot throw).
  if (deps.ownerHandles.length > 1) {
    throw new Error(
      `seedOwner: refusing to seed ${deps.ownerHandles.length} owners (D17: the box has EXACTLY ONE owner) — OWNER_HANDLES must name one handle: ${deps.ownerHandles.join(", ")}`,
    );
  }
  const at = deps.now();
  // Both-or-neither: the caller passes `initialPassword` + `hashPassword` ONLY in AUTH_MODE=local (see
  // lifecycle). Absent ⇒ the password backfill is skipped entirely (single-user / oidc / forward-header).
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
    // Count only — the cleartext password is NEVER logged.
    getLog().info(
      { owners: passwordsSeeded },
      "boot/seed-owner: seeded initial local-owner password (first boot, AUTH_MODE=local)",
    );
  }
  return ids;
}

/**
 * First-boot local-password backfill for ONE owner row. Reads the row first so the scrypt KDF only runs when
 * there is no password yet (a re-boot of an owner who already has one — env value OR a later self-rotation —
 * burns no KDF and writes nothing). The `isNull(password_hash)` WHERE guard is the atomic non-clobber belt
 * beneath that read (same spirit as the `ne(role, 'owner')` guard). Returns whether a hash was written.
 */
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
