// verb: setEnabled — enable/disable a user account. admin-gated (owner ∪ admin). Three guards:
//   • cannot_disable_self — an actor may not disable their own account (locks the deployment out of itself)
//   • owner-immutability  — the owner is never disabled (friendly pre-check + atomic `WHERE role <> 'owner'`)
//   • existence-before-audit — `loadUser` throws DomainNotFoundError BEFORE the write, so a write to a
//     missing id never leaves a phantom audit row
// Disabling revokes all of the target's live sessions (the kick tail) via the injected SessionAdminPort.
//
// The flip, its audit row and the kick are ONE batch (#1691, `substrate/audited-write.ts`). Not named in the
// row's three verbs, fixed with them because it is the same shape on the same seam and leaving it behind
// would be half a migration: a containment action (disable) that returns success with no forensic row is the
// same defect as an unaudited grant, and `logAudit` swallows in production.
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
import { commitAuditedWrite } from "../substrate/audited-write.ts";

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
    // ONE batch: the flip, its audit row, and (on the DISABLE arm) the kick (#1691). The kick is a TAIL, not
    // statement 2 — the audit's `changes()` guard reads the statement immediately before it, and a target
    // holding no live sessions legitimately revokes 0 rows.
    const updated = await commitAuditedWrite(ctx, {
      write: ctx.db
        .update(users)
        .set({ enabled, updatedAt: at })
        .where(and(eq(users.id, userId), ne(users.role, OWNER_ROLE)))
        .returning(userCols),
      entry: {
        actorUserId: params.principal.userId,
        action: "admin.setEnabled",
        entityType: "user",
        entityId: userId,
        metadata: { enabled },
      },
      at,
      tails: enabled ? [] : [ctx.sessions.revokeAllForUserStatement(userId, at)],
    });
    const row = updated[0];
    if (row === undefined) {
      throw new DomainOperationError(ADMIN_OP_CODES.cannotModifyOwner, "the owner cannot be disabled");
    }

    if (!enabled) {
      // After the commit, and needing no retry record: the durable revoke is what `sessions.validate`
      // refuses on the socket's next request (and `enabled` gates every request arm besides).
      ctx.sessions.evictUserSockets(userId);
    }
    // setEnabled deliberately accepts agent targets — it is the containment verb (design of record, D60
    // build-state rider: agent principals are not built yet; when they land, disabling one must drop it
    // from every cast/arbitration and make every canAgent throw).
    return { ...row, ownerHandle: target.ownerHandle };
  };
}
