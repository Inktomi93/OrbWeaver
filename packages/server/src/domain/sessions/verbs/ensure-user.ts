import type { Handle, UserId } from "@orb/kit/ids";
import { castId, newId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { insertUser, selectIdByHandle } from "../persistence/users.ts";
import { determineRole } from "../substrate/role-policy.ts";

// Resolve a handle → UserId, JIT-creating the row on first sight (single-user/owner-fallback path;
// externalId stays null — provisionIdentity owns the SSO path). Race-tolerant: insertUser does
// onConflictDoNothing, then we re-read to absorb a concurrent first-login winner.
//
// THE RE-READ IS THE RESULT, NOT A HINT. `onConflictDoNothing` swallows a collision on ANY unique column,
// and only the `users_handle_unique` one is the benign race this verb is tolerant OF — a swallow on
// `users_single_owner_unique` (the box already has its one `role='owner'` row, under a DIFFERENT handle),
// `users_handle_key_unique` (another row holds a case variant or look-alike of this handle, D257) or
// `users_external_id_unique` leaves NO row at this handle. Returning the locally-minted id there hands the
// caller an id that points at nothing, and its worst consumer is boot: `seedOwner` carries it into
// `createServices` and into the boot Principal, where `principalFromRow` DEGRADES a missing row to
// `role:"user"` (correct for the frozen-host bridge, catastrophic here) — so every owner-scoped seed runs
// against a non-existent, non-owner principal. A fabricated id is the worst arm; this verb fails loudly.

export function createEnsureUser(ctx: SessionsContext): Pick<SessionsService, "ensureUser"> {
  async function ensureUser(rawHandle: string): Promise<UserId> {
    const handle = castId<Handle>(rawHandle.trim());

    const existing = await selectIdByHandle(ctx.db, handle);
    if (existing !== undefined) {
      return existing;
    }
    const id = newId<UserId>();
    const now = ctx.now();
    const role = determineRole(handle, []);
    await insertUser(ctx.db, {
      id,
      handle,
      externalId: null,
      email: null,
      role,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
    const settled = await selectIdByHandle(ctx.db, handle);
    if (settled === undefined) {
      throw new Error(
        `ensureUser: no users row for handle "${handle}" after insert — the insert was rejected by a UNIQUE constraint other than the handle (a row already holds role='owner' under a different handle, another row holds this handle's key as a case variant or look-alike (users_handle_key_unique, D257), or its external_id is taken). Refusing to return an id that points at no row.`,
      );
    }
    getLog().info({ handle }, "user: created tenant row");
    // #2481 — the new account's local-light vector floor, AFTER the row has settled and outside any batch
    // (§5.3b). Injected, total, and idempotent: when this call LOST the `onConflictDoNothing` race, `settled`
    // is the winner's id and the `(owner_id, label)` unique makes seeding it again a no-op.
    await ctx.seedUserConnections(settled);
    return settled;
  }
  return { ensureUser };
}
