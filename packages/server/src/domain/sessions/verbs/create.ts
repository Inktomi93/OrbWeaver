import { randomBytes } from "node:crypto";
import { DomainForbiddenError } from "@orb/kit/errors";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { getLog, logAudit } from "#foundation/observability";
import type { CreateSessionParams } from "../contract/params";
import type { CreateSessionResult } from "../contract/results";
import type { SessionsContext, SessionsService } from "../contract/service";
import { insertSession } from "../persistence/sessions";
import { selectKindById } from "../persistence/users";

// Mint a revocable BFF session: a 32-byte opaque token whose peppered hash alone is persisted. Every
// mint is a login (local route + OIDC callback funnel here), so it audits AUTH_LOGIN; admin-initiated
// revokes audit at the admin layer.

const RANDOM_TOKEN_BYTES = 32;
const AUTH_LOGIN = "AUTH_LOGIN";
const SESSION_ENTITY = "session";

export function createCreate(ctx: SessionsContext): Pick<SessionsService, "create"> {
  async function create(params: CreateSessionParams): Promise<CreateSessionResult> {
    // FLAG[PD-17]: an agent principal is structurally sessionless — refuse the mint outright so a future
    // caller bug can never hand an agent a live cookie.
    if ((await selectKindById(ctx.db, params.userId)) === "agent") {
      throw new DomainForbiddenError("agent principals are sessionless — no BFF session may be minted");
    }
    const token = randomBytes(RANDOM_TOKEN_BYTES).toString("base64url");
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
