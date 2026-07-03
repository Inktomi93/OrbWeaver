// verb: listUsers — the admin user table. admin-gated (owner ∪ admin); defense-in-depth even though the
// transport `adminMiddleware` already gated (the verb is safe independent of its caller).

import type { ListUsersParams } from "../contract/params";
import type { AdminContext, AdminService } from "../contract/service";
import { requireAdmin } from "../guard";
import { listUsers } from "../persistence/queries";

export function createListUsers(ctx: AdminContext): AdminService["listUsers"] {
  // `async` so a gate-deny surfaces as a REJECTED promise (consistent with every other verb), not a
  // synchronous throw — a caller doing `.catch()` without `await` is still safe.
  return async (params: ListUsersParams) => {
    requireAdmin(params.principal);
    // `params.kind` filters the Humans/Agents tab off this one procedure (absent = all — D60).
    return await listUsers(ctx.db, params.kind);
  };
}
