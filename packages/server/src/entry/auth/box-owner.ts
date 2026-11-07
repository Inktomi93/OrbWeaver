import type { UserId } from "@orb/kit/ids";
import { isOwner } from "#domain/admin";
import type { SessionsService } from "#domain/sessions";
import { createHostPrincipalResolver } from "./seam.ts";

/** Whether an account is the box owner, for a run no person stands behind. It reads the host resolver's row mapper, so
 *  `can()` stays the one comparison, and an unknown id reads as no owner. */
export function createBoxOwnerRead(sessions: Pick<SessionsService, "loadUserById">): (userId: UserId) => Promise<boolean> {
  const resolvePrincipal = createHostPrincipalResolver(sessions);
  return async (userId: UserId): Promise<boolean> => isOwner(await resolvePrincipal(userId));
}
