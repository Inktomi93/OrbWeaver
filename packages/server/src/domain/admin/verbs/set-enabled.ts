// verb: setEnabled — enable/disable a user account. admin-gated (owner ∪ admin). Three guards:
//   • cannot_disable_self — an actor may not disable their own account (locks the deployment out of itself)
//   • owner-immutability  — the owner is never disabled (friendly pre-check + atomic `WHERE role <> 'owner'`)
//   • existence-before-audit — `loadUser` throws DomainNotFoundError BEFORE the write, so a write to a
//     missing id never leaves a phantom audit row
// Disabling revokes all of the target's live sessions (the kick tail) via the injected SessionAdminPort.
//
// NO `identityChanged` EMIT HERE, deliberately — and the staleness design's §4.4.3 names this verb as a
// producer, so read the receipt before "fixing" the omission (W7b lane, 2026-08-14). Two independent reasons,
// either of which is sufficient:
//   • The target has no channel to reach. `validate` gates a disabled row to null on EVERY request
//     (`sessions/verbs/validate.ts:18` — "gating `enabled` to null here IS how disable takes effect next
//     request"), the SSO-header arm refuses on `!provisioned.enabled` and the owner-fallback arm applies the
//     same gate (`entry/auth/seam.ts`), so a disabled user cannot hold a live socket. On the DISABLE arm the
//     kick tail below revokes every session and the entry wrapper evicts the live sockets with it (W7a,
//     `entry/compose/admin.ts`); on the ENABLE arm there was no live client to announce to in the first place.
//   • Nothing an identity read PROJECTS moved. `sessions.me` is userId/handle/globalRole
//     (`transport/trpc/routers/sessions.ts`); `enabled` appears in none of them.
// `setRole` is the arm that genuinely strands a live tab, and it emits.

import { users } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { and, eq, ne } from "drizzle-orm";
import type { AdminContext } from "../context.ts";
import { ADMIN_OP_CODES } from "../contract/errors.ts";
import type { SetEnabledParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import { requireAdmin } from "../guard.ts";
import { loadUser, userCols } from "../persistence/queries.ts";

const OWNER_ROLE = "owner";

export function createSetEnabled(ctx: AdminContext): AdminService["setEnabled"] {
  return async (params: SetEnabledParams) => {
    requireAdmin(params.principal);
    const { userId, enabled } = params;

    if (!enabled && userId === params.principal.userId) {
      throw new DomainOperationError(ADMIN_OP_CODES.cannotDisableSelf, "you cannot disable your own account");
    }

    const target = await loadUser(ctx.db, userId);
    if (target === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    if (target.role === OWNER_ROLE) {
      throw new DomainOperationError(ADMIN_OP_CODES.cannotModifyOwner, "the owner cannot be disabled");
    }

    const at = ctx.now();
    const updated = await ctx.db
      .update(users)
      .set({ enabled, updatedAt: at })
      .where(and(eq(users.id, userId), ne(users.role, OWNER_ROLE)))
      .returning(userCols);
    const row = updated[0];
    if (row === undefined) {
      throw new DomainOperationError(ADMIN_OP_CODES.cannotModifyOwner, "the owner cannot be disabled");
    }

    if (!enabled) {
      await ctx.sessions.revokeAllForUser(userId);
    }

    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.setEnabled",
        entityType: "user",
        entityId: userId,
        metadata: { enabled },
      },
      at,
    );
    // setEnabled deliberately accepts agent targets — it is the containment verb (design of record, D60
    // build-state rider: agent principals are not built yet; when they land, disabling one must drop it
    // from every cast/arbitration and make every canAgent throw).
    return { ...row, ownerHandle: target.ownerHandle };
  };
}
