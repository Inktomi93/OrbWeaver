import type { SessionId, UserId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { SessionsContext, SessionsService } from "../contract/service";
import { revokeAllForUser as revokeAllForUserQuery, revokeById, revokeByTokenHash } from "../persistence/sessions";

// The three revoke paths — by token (logout), by id (admin kick one device), all-for-user (admin disable /
// kick-all). Each is ONE atomic `UPDATE … WHERE revokedAt IS NULL RETURNING`, so there is no read-then-
// write window where a concurrent revoke double-audits or a freshly-minted session escapes. Only the call
// that actually flips `revokedAt` gets a returned row; the loser matches nothing and skips the audit.

const AUTH_LOGOUT = "AUTH_LOGOUT";
const SESSION_ENTITY = "session";

export function createRevoke(ctx: SessionsContext): Pick<SessionsService, "revokeByToken" | "revoke" | "revokeAllForUser"> {
  async function revokeByToken(token: string): Promise<void> {
    const now = ctx.now();
    const revoked = await revokeByTokenHash(ctx.db, ctx.hashToken(token), now);
    // The returned row attributes the logout to its user (the token is not identity).
    if (revoked !== undefined) {
      await logAudit(
        ctx.db,
        {
          actorUserId: revoked.userId,
          action: AUTH_LOGOUT,
          entityType: SESSION_ENTITY,
          entityId: revoked.id,
        },
        now,
      );
    }
  }

  async function revoke(sessionId: SessionId): Promise<void> {
    await revokeById(ctx.db, sessionId, ctx.now());
    getLog().info({ sessionId }, "session: revoked");
  }

  async function revokeAllForUser(userId: UserId): Promise<number> {
    const revokedIds = await revokeAllForUserQuery(ctx.db, userId, ctx.now());
    if (revokedIds.length > 0) {
      getLog().info({ userId, count: revokedIds.length }, "session: revoked all for user");
    }
    return revokedIds.length;
  }

  return { revokeByToken, revoke, revokeAllForUser };
}
