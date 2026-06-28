// verb: listUsers — the admin user table. admin-gated (owner ∪ admin); defense-in-depth even though the
// transport `adminMiddleware` already gated (the verb is safe independent of its caller, admin.md §Esoteric).

import type { ListUsersParams } from "../contract/params";
import type { AdminContext, AdminService } from "../contract/service";
import { requireAdmin } from "../guard";
import { listAllUsers } from "../persistence/queries";

export function createListUsers(ctx: AdminContext): AdminService["listUsers"] {
  // `async` so a gate-deny surfaces as a REJECTED promise (consistent with every other verb), not a
  // synchronous throw — a caller doing `.catch()` without `await` is still safe.
  return async (params: ListUsersParams) => {
    requireAdmin(params.principal);
    return await listAllUsers(ctx.db);
  };
}
