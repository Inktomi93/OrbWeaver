import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { CreateSessionParams } from "../contract/params.ts";
import type { CreateSessionResult } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { insertSession } from "../persistence/sessions.ts";

// Mint a revocable BFF session: a 32-byte opaque token whose peppered hash alone is persisted. Every
// mint is a login (local route + OIDC callback funnel here), so it audits AUTH_LOGIN; admin-initiated
// revokes audit at the admin layer.
//
// #141 — an OIDC mint additionally carries the IdP `id_token`, sealed here (never written in the clear) so
// this session's own logout can present it as `id_token_hint`. It is sealed AFTER the row id is minted,
// because that id is the GCM AAD; nothing else in this verb touches it, and it reaches no log or audit
// field — the `logAudit` below records the session id, never the params.

const AUTH_LOGIN = "AUTH_LOGIN";
const SESSION_ENTITY = "session";

export function createCreate(ctx: SessionsContext): Pick<SessionsService, "create"> {
  async function create(params: CreateSessionParams): Promise<CreateSessionResult> {
    const token = ctx.mintToken();
    const sessionId = mintTypeId(ID_PREFIX.session);
    const now = ctx.now();
    const expiresAt = now + ctx.ttlMs;
    const idToken = params.oidcIdToken ?? "";
    await insertSession(ctx.db, {
      id: sessionId,
      userId: params.userId,
      tokenHash: ctx.hashToken(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgent: params.userAgent ?? null,
      // Bound to THIS row (AAD = sessionId). An absent/empty token stores nothing rather than sealing "".
      oidcIdToken: idToken.length > 0 ? ctx.sealIdToken(idToken, sessionId) : null,
    });
    getLog().info({ userId: params.userId, sessionId }, "session: created");
    await logAudit(
      ctx.db,
      {
        actorUserId: params.userId,
        action: AUTH_LOGIN,
        entityType: SESSION_ENTITY,
        entityId: sessionId,
      },
      now,
    );
    return { token, sessionId, expiresAt };
  }
  return { create };
}
