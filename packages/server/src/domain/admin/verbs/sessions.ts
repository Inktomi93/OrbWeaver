// verbs: listSessions / revokeSession / revokeUserSessions — the admin session-management surface. One
// file (the "one logical group per file" allowance) because the three share identical
// guard + delegation mechanics: admin-gate, then delegate to the injected SessionAdminPort (admin owns
// neither the sessions table nor its revoke machinery — dependency inversion). Each WRITE audits.

import type { AdminContext } from "../context";
import type {
  ListSessionsParams,
  RevokeSessionParams,
  RevokeUserSessionsParams,
} from "../contract/params";
import type { AdminService } from "../contract/service";
import { requireAdmin } from "../guard";

type SessionVerbs = Pick<AdminService, "listSessions" | "revokeSession" | "revokeUserSessions">;

export function createSessions(ctx: AdminContext): SessionVerbs {
  const listSessions: AdminService["listSessions"] = async (params: ListSessionsParams) => {
    requireAdmin(params.principal);
    return await ctx.sessions.listForUser(params.userId);
  };

  const revokeSession: AdminService["revokeSession"] = async (params: RevokeSessionParams) => {
    requireAdmin(params.principal);
    await ctx.sessions.revoke(params.sessionId);
    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.revokeSession",
        entityType: "session",
        entityId: params.sessionId,
      },
      ctx.now(),
    );
  };

  const revokeUserSessions: AdminService["revokeUserSessions"] = async (
    params: RevokeUserSessionsParams,
  ) => {
    requireAdmin(params.principal);
    const revoked = await ctx.sessions.revokeAllForUser(params.userId);
    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.revokeUserSessions",
        entityType: "user",
        entityId: params.userId,
        metadata: { revoked },
      },
      ctx.now(),
    );
    return { revoked };
  };

  return { listSessions, revokeSession, revokeUserSessions };
}
