import type { SessionView } from "@orb/contracts/session";
import type { UserId } from "@orb/kit/ids";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { listForUser as listForUserQuery } from "../persistence/sessions.ts";

// The admin device list — a user's sessions projected to the secret-free `SessionView` (no token / hash /
// pepper / userId). Consumed by `admin` through the injected `SessionAdminPort`, never a sideways import.

export function createList(ctx: SessionsContext): Pick<SessionsService, "listForUser"> {
  async function listForUser(userId: UserId): Promise<SessionView[]> {
    return await listForUserQuery(ctx.db, userId);
  }
  return { listForUser };
}
