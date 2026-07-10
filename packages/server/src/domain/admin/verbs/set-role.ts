// verb: setRole — grant/revoke the delegated `admin` role. OWNER-ONLY (`requireOwner`, D17 — only the box
// owner grants/revokes admin; the delegated axis is `user ↔ admin`). The owner role is never MINTED or
// DEMOTED here: owner→owner is an idempotent no-op success; promoting a SECOND user to owner is refused
// with a friendly typed CONFLICT (D40 single-owner — `users_single_owner_unique`) checked BEFORE the write
// so the raw partial-unique violation never escapes (ownership transfer is out of scope); the sole owner
// can never be demoted (D17). The immutability guard rides BOTH layers: the `loadUser` owner-row pre-check
// for the fast/typed errors, AND the atomic `WHERE role <> 'owner'` ON THE UPDATE so the owner row is
// un-demotable under a race. Neo's "≥1 enabled admin" last-admin guard is GONE: `requireAdmin` = owner ∪
// admin, so the immutable owner is always an administrator — the admin-capable set can never empty, and
// demoting the last DELEGATED admin is allowed (the owner remains).

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

    // Friendly pre-check (existence-before-write + the fast-path owner/agent/conflict errors).
    const target = await loadUser(ctx.db, userId);
    if (target === undefined) {
      throw new DomainNotFoundError("user", userId);
    }
    // The sole owner (D40) — the only owner-touching op allowed is the idempotent owner→owner (no-op
    // success); any OTHER role is a demotion, refused in BOTH layers (D17 owner-immutability).
    if (target.role === OWNER_ROLE) {
      if (role === OWNER_ROLE) {
        return target;
      }
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyOwner,
        "the owner cannot be demoted",
      );
    }
    // An agent principal's authority is the doc-03 ceiling, never the role axis (D60). The `users_agent_shape`
    // CHECK (`role='user'`) is the DDL floor; this gives the honest error first.
    if (target.kind === AGENT_KIND) {
      throw new DomainOperationError(
        ADMIN_OP_CODES.cannotModifyAgent,
        "an agent principal's role cannot be changed — its authority is the capability ceiling",
      );
    }
    // Promoting a NON-owner to owner would mint a SECOND owner — the `users_single_owner_unique` partial
    // index (D40) forbids it at the DB. Surface the friendly typed CONFLICT here so the raw unique
    // violation never escapes; ownership transfer is deliberately not supported.
    if (role === OWNER_ROLE) {
      throw new DomainConflictError("an owner already exists; ownership transfer is not supported");
    }

    const at = ctx.now();
    // Atomic backstops: `role <> 'owner'` AND `kind <> 'agent'` — the row matches 0 rows if it became an
    // owner/agent between the pre-check and here (the real race defense; the pre-checks are the friendly errors).
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
