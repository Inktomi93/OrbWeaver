// verb: setRole — grant/revoke the delegated `admin` role, owner-only. The owner role is never minted or
// demoted; a single-owner conflict and the owner-immutability guard are checked pre-write AND re-asserted
// atomically in the UPDATE's WHERE to close the race.

import { users } from "@orb/db";
import { DomainConflictError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { and, eq, ne } from "drizzle-orm";
import { ADMIN_OP_CODES } from "../contract/errors";
import type { SetRoleParams } from "../contract/params";
import type { AdminContext, AdminService } from "../contract/service";
import { requireOwner } from "../guard";
import { loadUser, userCols } from "../persistence/queries";

const OWNER_ROLE = "owner";
const AGENT_KIND = "agent";

export function createSetRole(ctx: AdminContext): AdminService["setRole"] {
  return async (params: SetRoleParams) => {
    requireOwner(params.principal);
    const { userId, role } = params;

    const target = await loadUser(ctx.db, userId);
    if (target === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    if (target.role === OWNER_ROLE) {
      if (role === OWNER_ROLE) {
        return target;
      }
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyOwner,
        "the owner cannot be demoted",
      );
    }
    if (target.kind === AGENT_KIND) {
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyAgent,
        "an agent principal's role cannot be changed — its authority is the capability ceiling",
      );
    }
    if (role === OWNER_ROLE) {
      throw new DomainConflictError("an owner already exists; ownership transfer is not supported");
    }

    const at = ctx.now();
    // Race defense: 0 rows match if the row became owner/agent between the pre-check and here.
    const updated = await ctx.db
      .update(users)
      .set({ role, updatedAt: at })
      .where(and(eq(users.id, userId), ne(users.role, OWNER_ROLE), ne(users.kind, AGENT_KIND)))
      .returning(userCols);
    const row = updated[0];
    if (row === undefined) {
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyOwner,
        "the owner cannot be demoted",
      );
    }

    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.setRole",
        entityType: "user",
        entityId: userId,
        metadata: { role },
      },
      at,
    );
    // `ownerHandle` is unchanged by a role write — carry it from the pre-loaded view (no re-read).
    return { ...row, ownerHandle: target.ownerHandle };
  };
}
