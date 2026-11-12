// domain/admin/persistence/sessions — the one admin read of `sessions`: whose a session is, so the session verbs can
// refuse a delegated admin the owner's sessions. It reads no role; the verb takes the role from `loadUser`.

import type { Db } from "@orb/db";
import { sessions } from "@orb/db";
import type { SessionId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

const LIMIT_ONE = 1;

/** The user a session belongs to, or `undefined` for an unknown session. */
export async function loadSessionUserId(db: Db, sessionId: SessionId): Promise<UserId | undefined> {
  const rows = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, sessionId)).limit(LIMIT_ONE);
  return rows[0]?.userId;
}
