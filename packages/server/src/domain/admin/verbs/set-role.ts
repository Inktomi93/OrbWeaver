// verb: setRole — grant/revoke the delegated `admin` role, owner-only. The owner role is never minted or
// demoted; a single-owner conflict and the owner-immutability guard are checked pre-write AND re-asserted
// atomically in the UPDATE's WHERE to close the race.

import { users } from "@orb/db";
import { DomainConflictError, DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { and, eq, ne } from "drizzle-orm";
import type { AdminContext } from "../context.ts";
import { ADMIN_OP_CODES } from "../contract/errors.ts";
import type { SetRoleParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import { requireOwner } from "../guard.ts";
import { loadUser, userCols } from "../persistence/queries.ts";

const OWNER_ROLE = "owner";

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
      throw new DomainOperationError(ADMIN_OP_CODES.cannotModifyOwner, "the owner cannot be demoted");
    }

    if (role === OWNER_ROLE) {
      throw new DomainConflictError("an owner already exists; ownership transfer is not supported");
    }

    const at = ctx.now();
    // Race defense: 0 rows match if the row became owner/agent between the pre-check and here.
    const updated = await ctx.db
      .update(users)
      .set({ role, updatedAt: at })
      .where(and(eq(users.id, userId), ne(users.role, OWNER_ROLE)))
      .returning(userCols);
    const row = updated[0];
    if (row === undefined) {
      throw new DomainOperationError(ADMIN_OP_CODES.cannotModifyOwner, "the owner cannot be demoted");
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
    // W7b — announce to the GRANTEE, not the granting owner. `sessions.me` projects `globalRole` straight off
    // the request Principal, and the QueryClient runs `staleTime: Infinity`, so before this a promoted user's
    // live tab kept rendering the pre-grant role until they happened to reload
    // (docs/design/staleness-and-session-freshness.md §2.3.4). Unconditional on the WRITE, not on a
    // role-difference check: the atomic UPDATE above already returned a row, and re-granting the same role is
    // one idempotent refetch, whereas skipping it on a "no change" guard would strand a client whose cached
    // read is stale for some OTHER reason.
    ctx.emitUserEvent(userId, { type: "identityChanged" });
    // `ownerHandle` is unchanged by a role write — carry it from the pre-loaded view (no re-read).
    return { ...row, ownerHandle: target.ownerHandle };
  };
}
