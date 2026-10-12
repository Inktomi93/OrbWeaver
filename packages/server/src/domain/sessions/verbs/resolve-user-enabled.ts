// op: resolveUserEnabled — the disabled-account containment read every non-request consumer asks (roster assembly,
// inherited books, an automation author's standing authority). Read fresh per call, and FAIL-CLOSED: a missing row
// answers `false`, never "assume enabled". Principal-less and compose-built over the service's own row read.

import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "../contract/service.ts";

export function createResolveUserEnabled(sessions: Pick<SessionsService, "loadUserById">): (userId: UserId) => Promise<boolean> {
  return async (userId: UserId): Promise<boolean> => (await sessions.loadUserById(userId))?.enabled === true;
}
