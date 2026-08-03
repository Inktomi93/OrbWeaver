import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { CreateSessionParams } from "../contract/params.ts";
import type { CreateSessionResult } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { insertSession } from "../persistence/sessions.ts";

// Mint a revocable BFF session: a 32-byte opaque token whose peppered hash alone is persisted. Every
// mint is a login (local route + OIDC callback funnel here), so it audits AUTH_LOGIN; admin-initiated
// revokes audit at the admin layer.

const AUTH_LOGIN = "AUTH_LOGIN";
const SESSION_ENTITY = "session";

export function createCreate(ctx: SessionsContext): Pick<SessionsService, "create"> {
  async function create(params: CreateSessionParams): Promise<CreateSessionResult> {
    const token = ctx.mintToken();
    const sessionId = mintTypeId(ID_PREFIX.session);
    const now = ctx.now();
    const expiresAt = now + ctx.ttlMs;
    await insertSession(ctx.db, {
      id: sessionId,
      userId: params.userId,
      tokenHash: ctx.hashToken(token),
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgent: params.userAgent ?? null,
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
