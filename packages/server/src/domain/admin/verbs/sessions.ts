// verbs: listSessions / revokeSession / revokeUserSessions — the admin session-management surface. One
// file (the "one logical group per file" allowance) because the three share identical
// guard + delegation mechanics: admin-gate, then delegate to the injected SessionAdminPort (admin owns
// neither the sessions table nor its revoke machinery — dependency inversion). Each WRITE audits.
//
// ONLY THE OWNER MANAGES THE OWNER'S SESSIONS (D17). A delegated admin listing them watches the owner's devices, and
// revoking them locks the owner out on demand, the takeover `reset-password.ts` refuses. The decision is the kernel's
// (`isBootstrapOwnerRole`, `isOwner`); a session id the caller may not touch reads as not found whether it is unknown
// or the owner's, so the refusal is no oracle for which sessions are the owner's.

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { ADMIN_OP_CODES } from "../contract/errors.ts";
import type { AdminActorParams, ListSessionsParams, RevokeSessionParams, RevokeUserSessionsParams } from "../contract/params.ts";
import type { AdminContext, AdminService } from "../contract/service.ts";
import { isBootstrapOwnerRole, isOwner, requireAdmin } from "../guard.ts";
import { loadUser } from "../persistence/queries.ts";
import { loadSessionUserId } from "../persistence/sessions.ts";

type SessionVerbs = Pick<AdminService, "listSessions" | "revokeSession" | "revokeUserSessions">;

export function createSessions(ctx: AdminContext): SessionVerbs {
  // Whether this caller may not touch `userId`'s sessions: the owner's, to anyone but the owner.
  const ownerTargetRefused = async (params: AdminActorParams, userId: UserId): Promise<boolean> => {
    const target = await loadUser(ctx.db, userId);
    return target !== undefined && isBootstrapOwnerRole(target.role) && !isOwner(params.principal);
  };

  const refuseOwnerTarget = async (params: AdminActorParams, userId: UserId): Promise<void> => {
    if (await ownerTargetRefused(params, userId)) {
      throw new DomainOperationError(ADMIN_OP_CODES.cannotModifyOwner, "only the owner can manage the owner's sessions");
    }
  };

  const listSessions: AdminService["listSessions"] = async (params: ListSessionsParams) => {
    requireAdmin(params.principal);
    await refuseOwnerTarget(params, params.userId);
    return await ctx.sessions.listForUser(params.userId);
  };

  const revokeSession: AdminService["revokeSession"] = async (params: RevokeSessionParams) => {
    requireAdmin(params.principal);
    const userId = await loadSessionUserId(ctx.db, params.sessionId);
    if (userId === undefined || (await ownerTargetRefused(params, userId))) {
      throw new DomainNotFoundError("session", params.sessionId);
    }
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

  const revokeUserSessions: AdminService["revokeUserSessions"] = async (params: RevokeUserSessionsParams) => {
    requireAdmin(params.principal);
    await refuseOwnerTarget(params, params.userId);
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
  };

  return { listSessions, revokeSession, revokeUserSessions };
}
