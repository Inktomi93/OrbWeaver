// verb: resetPassword — set a user's local password. admin-gated. loadUser throws before the write, so
// a reset on a missing id leaves no phantom audit row. A successful reset revokes all of the target's
// live sessions.
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
    await ctx.db.update(users).set({ passwordHash, updatedAt: at }).where(eq(users.id, userId));

    // A credential change invalidates outstanding logins — kick every live session.
    await ctx.sessions.revokeAllForUser(userId);

    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.resetPassword",
        entityType: "user",
        entityId: userId,
      },
      at,
    );
  };
}
