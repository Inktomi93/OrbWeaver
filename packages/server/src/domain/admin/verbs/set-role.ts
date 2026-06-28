// verb: setRole — grant/revoke the delegated `admin` role. OWNER-ONLY (`requireOwner`, D17 — only the box
// owner grants/revokes admin; `user ↔ admin` only, NEVER to/from `owner`). Carries the owner-immutability
// guard in BOTH layers (admin.md invariant #3): a friendly `loadUser` owner-row pre-check for the fast
// error, AND the atomic `WHERE role <> 'owner'` ON THE UPDATE so the owner row is un-demotable under a race.
// Neo's "≥1 enabled admin" last-admin guard is GONE: `requireAdmin` = owner ∪ admin, so the immutable owner
// is always an administrator — the admin-capable set can never empty, and demoting the last DELEGATED admin
// is allowed (the owner remains).

import { users } from "@orb/db";
import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import { and, eq, ne } from "drizzle-orm";
import { ADMIN_OP_CODES } from "../contract/errors";
import type { SetRoleParams } from "../contract/params";
import type { AdminContext, AdminService } from "../contract/service";
import { requireOwner } from "../guard";
import { loadUser, userCols } from "../persistence/queries";

const OWNER_ROLE = "owner";

export function createSetRole(ctx: AdminContext): AdminService["setRole"] {
  return async (params: SetRoleParams) => {
    requireOwner(params.principal);
    const { userId, role } = params;

    // The owner role is the immutable bootstrap row — it is never granted or revoked here (D17).
    if (role === OWNER_ROLE) {
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotGrantOwner,
        "the owner role cannot be granted or revoked — it is the immutable bootstrap owner",
      );
    }

    // Friendly pre-check (existence-before-write + the fast-path owner error).
    const target = await loadUser(ctx.db, userId);
    if (target === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    if (target.role === OWNER_ROLE) {
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyOwner,
        "the owner cannot be demoted",
      );
    }

    const at = ctx.now();
    // Atomic backstop: `role <> 'owner'` means an owner row matches 0 rows even if it became owner between
    // the pre-check and here — the real defense under a race; the pre-check is only the friendly error.
    const updated = await ctx.db
      .update(users)
      .set({ role, updatedAt: at })
      .where(and(eq(users.id, userId), ne(users.role, OWNER_ROLE)))
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
    return row;
  };
}
