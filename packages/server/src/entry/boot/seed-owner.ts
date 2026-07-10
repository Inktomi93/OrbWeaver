// entry/boot/seed-owner — boot step 4: idempotent owner provisioning (core/Tier-5-Entry.md §"Boot order"; spine
// Spine-Identity-and-Auth.md §3 "Construction" — the one-time `role=owner` backfill for OWNER_HANDLES).
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

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, eq, ne } from "drizzle-orm";
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
  const ids = await Promise.all(
    deps.ownerHandles.map(async (handle): Promise<UserId> => {
      const userId = await deps.sessions.ensureUser(handle);
      await deps.db
        .update(users)
        .set({ role: OWNER_ROLE, updatedAt: at })
        .where(and(eq(users.id, userId), ne(users.role, OWNER_ROLE)));
      return userId;
    }),
  );
  getLog().info({ owners: ids.length }, "boot/seed-owner: ensured OWNER_HANDLES at role=owner");
  return ids;
}
