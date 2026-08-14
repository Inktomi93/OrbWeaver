import type { ExternalId, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { RevokedSessionsSummary } from "../contract/results.ts";
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
  async function revokeByToken(token: SessionToken): Promise<SessionId | null> {
    const now = ctx.now();
    const revoked = await revokeByTokenHash(ctx.db, ctx.hashToken(token), now);
    // The returned row attributes the logout to its user (the token is not identity).
    if (revoked === undefined) {
      return null;
    }
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
    // WHICH session this logout ended (W7a). The row is the only place the id exists — the caller holds a
    // token, and the token is not an identity. Returning it is what lets the logout ROUTE evict exactly this
    // device's live sockets (F4 per-SESSION) instead of every device the human is signed in on. `null` when
    // the row was already revoked: nothing was ended here, so nothing is evicted here either.
    return revoked.id;
  }

  async function revoke(sessionId: SessionId): Promise<UserId | null> {
    const userId = await revokeById(ctx.db, sessionId, ctx.now());
    if (userId === undefined) {
      return null;
    }
    getLog().info({ sessionId, userId }, "session: revoked");
    // WHOSE session this was — the entry tier evicts that user's live sockets (W7a). `null` when the row was
    // already revoked, so a repeat kick evicts nothing.
    return userId;
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
  async function revokeByExternalId(externalId: ExternalId): Promise<RevokedSessionsSummary> {
    const revoked = await revokeAllForExternalId(ctx.db, externalId, ctx.now());
    if (revoked.length > 0) {
      getLog().info({ externalId, count: revoked.length }, "session: revoked all for external subject (OIDC back-channel logout)");
    }
    // The distinct owners, so the route can evict their live sockets (W7a). Per-USER here, not per-session:
    // an IdP-initiated logout is a statement about the HUMAN, and a subject can be bound to more than one row.
    return { revoked: revoked.length, userIds: [...new Set(revoked.map((row) => row.userId))] };
  }

  return { revokeByToken, revoke, revokeAllForUser, revokeByExternalId };
}
