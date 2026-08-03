// verb: listUsers — the admin user table. admin-gated (owner ∪ admin); defense-in-depth even though the
// transport `adminMiddleware` already gated (the verb is safe independent of its caller).

import type { AdminContext } from "../context.ts";
import type { ListUsersParams } from "../contract/params.ts";
import type { AdminService } from "../contract/service.ts";
import { requireAdmin } from "../guard.ts";
import { listUsers } from "../persistence/queries.ts";

export function createListUsers(ctx: AdminContext): AdminService["listUsers"] {
  // `async` so a gate-deny surfaces as a REJECTED promise (consistent with every other verb), not a
  // synchronous throw — a caller doing `.catch()` without `await` is still safe.
  return async (params: ListUsersParams) => {
    requireAdmin(params.principal);
    // `params.kind` filters the Humans/Agents tab off this one procedure (absent = all — D60).
    return await listUsers(ctx.db, params.kind);
  };
}
