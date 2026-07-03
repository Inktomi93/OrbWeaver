// verb: resetPassword — set a user's local password. admin-gated (owner ∪ admin). Guards:
// weak_password (below the auth floor), existence-before-audit (loadUser throws DomainNotFoundError BEFORE
// the write, so a reset on a missing id leaves no phantom audit row, invariant #4). A successful reset
// revokes all of the target's live sessions (a credential change invalidates outstanding logins).

import { users } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { eq } from "drizzle-orm";
import { MIN_PASSWORD_LENGTH } from "#infra/auth";
import { ADMIN_OP_CODES } from "../contract/errors";
import type { ResetPasswordParams } from "../contract/params";
import type { AdminContext, AdminService } from "../contract/service";
import { requireAdmin } from "../guard";
import { loadUser } from "../persistence/queries";

export function createResetPassword(ctx: AdminContext): AdminService["resetPassword"] {
  return async (params: ResetPasswordParams) => {
    requireAdmin(params.principal);
    const { userId, password } = params;

    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new DomainOperationError(
        ADMIN_OP_CODES.weakPassword,
        `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }

    // Existence-before-write: a reset on a missing id throws and writes NO audit row.
    const target = await loadUser(ctx.db, userId);
    if (target === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    // An agent principal is loginless — there is no password to reset (D60). The `users_agent_shape` CHECK
    // (`password_hash IS NULL`) would refuse the write anyway; this gives the honest error first.
    if (target.kind === "agent") {
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyAgent,
        "an agent principal is loginless — it has no password to reset",
      );
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
