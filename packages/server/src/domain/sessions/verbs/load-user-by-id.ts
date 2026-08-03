import type { UserId } from "@orb/kit/ids";
import type { UserPrincipalFields } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { selectForProvisionById } from "../persistence/users.ts";

// Resolve a bare `users` row id → its live principal-fields (role/handle/externalId), or `null` for an
// unknown id. The frozen-host → `Principal` bridge (PD-73): chat's D19 cross-feature ops carry only the
// frozen host `UserId`, and the D17 role-sensitive ops (the max-pro-sub owner-gate) must key on the host's
// REAL `users.role` — sessions is the sanctioned `users` reader (the no-direct-users-read chokepoint), so
// this read homes here instead of an entry-local table reach. NOT a login path: no `enabled` gate (the
// host isn't authenticating — a disabled row still resolves so its role stays authoritative).

export function createLoadUserById(ctx: SessionsContext): Pick<SessionsService, "loadUserById"> {
  async function loadUserById(userId: UserId): Promise<UserPrincipalFields | null> {
    const row = await selectForProvisionById(ctx.db, userId);
    if (row === undefined) {
      return null;
    }
    return { role: row.role, handle: row.handle, externalId: row.externalId };
  }
  return { loadUserById };
}
