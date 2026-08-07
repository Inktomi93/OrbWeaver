import type { UserId } from "@orb/kit/ids";
import type { UserPrincipalFields } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { selectForProvisionById } from "../persistence/users.ts";

// Resolve a bare `users` row id → its live principal-fields (role/handle/externalId/enabled), or `null` for
// an unknown id. The frozen-host → `Principal` bridge (PD-73): chat's D19 cross-feature ops carry only the
// frozen host `UserId`, and the D17 role-sensitive ops (the max-pro-sub owner-gate) must key on the host's
// REAL `users.role` — sessions is the sanctioned `users` reader (the no-direct-users-read chokepoint), so
// this read homes here instead of an entry-local table reach.
//
// THIS VERB GATES NOTHING — it REPORTS `enabled` and the CALLER decides, because its two caller classes want
// opposite answers (D135 amendment):
//   • REQUEST authentication (the auth seam's owner-fallback arm) MUST refuse a disabled row, exactly as
//     `sessions.validate` (invariant #8/D40) and the SSO arm's `provisioned.enabled` do — otherwise one of
//     the three request paths admits an account the other two lock out.
//   • The FROZEN-HOST bridge must NOT: the host isn't authenticating, and a disabled (or merely offline)
//     host's row still has to answer "what is this room's authority" for the members still reading it.
// `enabled` rides on the row `selectForProvisionById` already SELECTs, so reporting it costs no extra read.

export function createLoadUserById(ctx: SessionsContext): Pick<SessionsService, "loadUserById"> {
  async function loadUserById(userId: UserId): Promise<UserPrincipalFields | null> {
    const row = await selectForProvisionById(ctx.db, userId);
    if (row === undefined) {
      return null;
    }
    return { role: row.role, handle: row.handle, externalId: row.externalId, enabled: row.enabled };
  }
  return { loadUserById };
}
