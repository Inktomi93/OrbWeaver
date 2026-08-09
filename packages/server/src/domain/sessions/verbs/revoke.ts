import type { ExternalId, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { revokeAllForExternalId, revokeAllForUser as revokeAllForUserQuery, revokeById, revokeByTokenHash } from "../persistence/sessions.ts";

// The four revoke paths — by token (logout), by id (admin kick one device), all-for-user (admin disable /
// kick-all), by-external-subject (OIDC back-channel logout, A5). Each is ONE atomic
// `UPDATE … WHERE revokedAt IS NULL RETURNING`, so there is no read-then-write window where a concurrent
// revoke double-audits or a freshly-minted session escapes. Only the call that actually flips `revokedAt`
// gets a returned row; the loser matches nothing and skips the audit.

const AUTH_LOGOUT = "AUTH_LOGOUT";
const SESSION_ENTITY = "session";

export function createRevoke(ctx: SessionsContext): Pick<SessionsService, "revokeByToken" | "revoke" | "revokeAllForUser" | "revokeByExternalId"> {
  async function revokeByToken(token: SessionToken): Promise<void> {
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

  // A5 — OIDC back-channel logout: revoke every live session for the user(s) bound to the IdP subject. No
  // audit actor row — the actor is the IdP, not a user — so this logs rather than `logAudit`s.
  async function revokeByExternalId(externalId: ExternalId): Promise<number> {
    const revokedIds = await revokeAllForExternalId(ctx.db, externalId, ctx.now());
    if (revokedIds.length > 0) {
      getLog().info({ externalId, count: revokedIds.length }, "session: revoked all for external subject (OIDC back-channel logout)");
    }
    return revokedIds.length;
  }

  return { revokeByToken, revoke, revokeAllForUser, revokeByExternalId };
}
