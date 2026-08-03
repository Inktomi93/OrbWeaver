// verb: resetPassword — set a user's local password. admin-gated. loadUser throws before the write, so
// a reset on a missing id leaves no phantom audit row. A successful reset revokes all of the target's
// live sessions.

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
