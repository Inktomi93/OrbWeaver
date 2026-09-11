import type { BatchStmt } from "@orb/db/kit";
import type { ExternalId, SessionId, SessionToken, UserId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { Sealed } from "#infra/crypto";
import type { RevokedSession, RevokedSessionsSummary } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import {
  revokeAllForExternalId,
  revokeAllForUser as revokeAllForUserQuery,
  revokeAllForUserStatement as revokeAllForUserStatementQuery,
  revokeById,
  revokeByTokenHash,
} from "../persistence/sessions.ts";

// The four revoke paths — by token (logout), by id (admin kick one device), all-for-user (admin disable /
// kick-all), by-external-subject (OIDC back-channel logout, A5). Each is ONE atomic
// `UPDATE … WHERE revokedAt IS NULL RETURNING`, so there is no read-then-write window where a concurrent
// revoke double-audits or a freshly-minted session escapes. Only the call that actually flips `revokedAt`
// gets a returned row; the loser matches nothing and skips the audit.

const AUTH_LOGOUT = "AUTH_LOGOUT";
const SESSION_ENTITY = "session";

/**
 * #141 — open the revoked row's sealed OIDC id_token for use as the logout `id_token_hint`, or `null`.
 *
 * A DECRYPT FAILURE MUST NEVER FAIL A LOGOUT. By the time this runs the session is ALREADY revoked — the
 * atomic UPDATE happened, the cookie is dead, the sockets are about to be evicted. The only thing at stake
 * is whether the IdP end-session URL can carry a hint, and the honest degrade is to send it bare (the
 * pre-#141 behaviour). The reachable cause is a rotated/changed `SESSION_SECRET`, which re-keys the HKDF
 * and makes every id_token already at rest unopenable; throwing would turn a cosmetic redirect loss into
 * "the sign-out button is broken" for every pre-rotation session.
 *
 * NOTHING ABOUT THE FAILURE IS LOGGED BEYOND THE FACT OF IT. The sealed bytes, the AAD and the raw GCM
 * error stay out of the record — the `domain/credentials/substrate/decrypt` posture.
 */
function openIdTokenHint(ctx: SessionsContext, sealed: Sealed | null, sessionId: SessionId): string | null {
  if (sealed === null) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): the DOCUMENTED degrade above — the session is already revoked when this runs, so a failed open costs only the end-session redirect (the URL goes out bare, as it did before #141) and never the logout itself. The one reachable cause is a rotated SESSION_SECRET. Ends if the end-session hint becomes required for a correct logout.
  try {
    return ctx.openIdToken(sealed, sessionId);
  } catch {
    getLog().warn({ sessionId }, "session: stored OIDC id_token could not be opened — signing out without an end-session hint");
    return null;
  }
}

export function createRevoke(
  ctx: SessionsContext,
): Pick<SessionsService, "revokeByToken" | "revoke" | "revokeAllForUser" | "revokeAllForUserStatement" | "revokeByExternalId"> {
  async function revokeByToken(token: SessionToken): Promise<RevokedSession | null> {
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
    // WHICH session this logout ended (W7a) + its OIDC end-session hint (#141). The row is the only place
    // the id exists — the caller holds a token, and the token is not an identity. Returning it is what lets
    // the logout ROUTE evict exactly this device's live sockets (F4 per-SESSION) instead of every device the
    // human is signed in on. `null` when the row was already revoked: nothing was ended here, so nothing is
    // evicted here either.
    return { sessionId: revoked.id, oidcIdToken: openIdTokenHint(ctx, revoked.oidcIdToken, revoked.id) };
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

  // The UNEXECUTED kick-all (#1691). No log line here on purpose: nothing has been revoked yet — the count
  // only exists once the CALLER's batch commits, and its forensic record is the audit row that commits with
  // it. The executed `revokeAllForUser` above keeps the breadcrumb for the explicit admin kick verb.
  const revokeAllForUserStatement = (userId: UserId, revokedAt: number): BatchStmt => revokeAllForUserStatementQuery(ctx.db, userId, revokedAt);

  return { revokeByToken, revoke, revokeAllForUser, revokeAllForUserStatement, revokeByExternalId };
}
