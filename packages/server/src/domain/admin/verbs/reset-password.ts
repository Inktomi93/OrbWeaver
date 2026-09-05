// verb: resetPassword — set a user's local password. admin-gated. loadUser throws before the write, so
// a reset on a missing id leaves no phantom audit row. A successful reset revokes all of the target's
// live sessions.
//
// THE CREDENTIAL WRITE, ITS AUDIT ROW AND THE SESSION KICK ARE ONE BATCH (#1691,
// `substrate/audited-write.ts`). They used to be three sequential awaits, and the middle one is a real DB
// write that can reject: a failed kick rejected the endpoint with the NEW password already committed and
// every OLD session still live — precisely the state an urgent reset exists to end, reported to the admin as
// a failure they would retry. (The audit tail failed the other way: `logAudit` swallows, so a degraded audit
// channel rotated a credential and returned 200 unrecorded.)
//
// Owner-credential guard (D17): the owner's password may be reset ONLY by the owner. Unlike its siblings
// (setRole/setEnabled, which block the owner row outright) this is NOT a blanket owner-immutability block —
// resetPassword is the ONLY passwordHash write path in the app (the sole others are create-user's insert
// and seed-owner's null-guarded first-boot backfill), so it is also how the owner rotates their OWN
// password. A blanket block would strand owner rotation with no in-app recovery. The scoped guard closes
// the actual hole — a delegated admin resetting the owner's password is account takeover under AUTH_MODE=local
// — while keeping owner self-rotation.

import { users } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import { MIN_PASSWORD_LENGTH } from "#infra/auth";
import type { AdminContext } from "../context.ts";
import { ADMIN_OP_CODES } from "../contract/errors.ts";
import type { ResetPasswordParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import { requireAdmin } from "../guard.ts";
import { loadUser } from "../persistence/queries.ts";
import { commitAuditedWrite } from "../substrate/audited-write.ts";

const OWNER_ROLE = "owner";

export function createResetPassword(ctx: AdminContext): AdminService["resetPassword"] {
  return async (params: ResetPasswordParams) => {
    requireAdmin(params.principal);
    const { userId, password } = params;

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new DomainOperationError(ADMIN_OP_CODES.weakPassword, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const target = await loadUser(ctx.db, userId);
    if (target === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    // Only the owner may reset the owner's credential — a delegated admin resetting it is takeover (D17).
    // Scoped to non-owner callers (not the siblings' blanket block) so the owner keeps self-rotation.
    if (target.role === OWNER_ROLE && params.principal.role !== OWNER_ROLE) {
      throw new DomainOperationError(ADMIN_OP_CODES.cannotModifyOwner, "only the owner can reset the owner's password");
    }

    const passwordHash = await ctx.hashPassword(password);
    const at = ctx.now();
    // ONE batch: the new credential, its audit row, and the kick commit together or not at all (#1691). The
    // kick is a TAIL, never statement 2 — the audit's `changes()` guard reads the statement before it, and a
    // target holding no live sessions legitimately revokes 0 rows.
    await commitAuditedWrite(ctx, {
      write: ctx.db.update(users).set({ passwordHash, updatedAt: at }).where(eq(users.id, userId)).returning({ id: users.id }),
      entry: {
        actorUserId: params.principal.userId,
        action: "admin.resetPassword",
        entityType: "user",
        entityId: userId,
      },
      at,
      tails: [ctx.sessions.revokeAllForUserStatement(userId, at)],
    });

    // The one tail that cannot ride the batch: the live SSE sockets, whose Principal froze at connect. It
    // runs AFTER the commit because a socket must not be torn down for a revoke that then rolls back, and it
    // needs no pending/retry record — the durable revoke is what `sessions.validate` refuses on the socket's
    // next request, so a missed eviction costs at most one connection's lifetime, never a live credential.
    ctx.sessions.evictUserSockets(userId);
  };
}
