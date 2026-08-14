import type { UserRole } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import { sessions, users } from "@orb/db";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";

// domain/sessions/persistence/sessions — all `sessions`-table access (queries only). Every timestamp
// arrives as a param (no ambient Date.now()); the token is never stored, lookups key on `tokenHash`.

// A hard ceiling on the per-user session list (admin device view). Not a tunable — a DoS floor: without
// it, an account that churned thousands of sessions makes the admin read pull (and serialize) every row.
// Newest-first so the truncation drops the STALEST devices, which is the only useful window anyway.
const SESSION_LIST_HARD_CAP = 200;

interface SessionInsert {
  id: SessionId;
  userId: UserId;
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  userAgent: string | null;
}

interface SessionValidationRow {
  sessionId: SessionId;
  userId: UserId;
  revokedAt: number | null;
  expiresAt: number;
  lastSeenAt: number;
  handle: Handle;
  externalId: ExternalId | null;
  role: UserRole;
  enabled: boolean;
}

export async function insertSession(db: Db, row: SessionInsert): Promise<void> {
  await db.insert(sessions).values(row);
}

export async function selectForValidation(db: Db, tokenHash: string): Promise<SessionValidationRow | undefined> {
  const rows = await db
    .select({
      sessionId: sessions.id,
      userId: sessions.userId,
      revokedAt: sessions.revokedAt,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      handle: users.handle,
      externalId: users.externalId,
      role: users.role,
      enabled: users.enabled,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    // FLAG[PD-17]: users.kind = 'human' — an agent principal is structurally sessionless.
    .where(and(eq(sessions.tokenHash, tokenHash), eq(users.kind, "human")))
    .limit(1);
  return rows.at(0);
}

export async function slideExpiry(db: Db, sessionId: SessionId, lastSeenAt: number, expiresAt: number): Promise<void> {
  await db.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, sessionId));
}

/** Flips revokedAt only on a still-live row, returning the owner so only the winning call audits. */
export async function revokeByTokenHash(db: Db, tokenHash: string, revokedAt: number): Promise<{ id: SessionId; userId: UserId } | undefined> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id, userId: sessions.userId });
  return revoked.at(0);
}

/** Flips revokedAt only on a still-live row, returning its OWNER (`undefined` = nothing to revoke) — the
 *  entry tier evicts that user's live sockets with it (W7a). */
export async function revokeById(db: Db, sessionId: SessionId, revokedAt: number): Promise<UserId | undefined> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .returning({ userId: sessions.userId });
  return revoked.at(0)?.userId;
}

export async function revokeAllForUser(db: Db, userId: UserId, revokedAt: number): Promise<SessionId[]> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.map((r) => r.id);
}

/** A5 — revoke every live session belonging to the user(s) bound to a stable external subject (`sub`). One
 *  atomic UPDATE over a `userId IN (SELECT id FROM users WHERE external_id = sub)` subquery + the
 *  `revokedAt IS NULL` guard, so a re-delivered back-channel logout token just re-revokes nothing (idempotent
 *  — no Redis replay cache needed). Returns the revoked rows so only real revocations are logged/audited —
 *  `userId` included because one subject can be bound to more than one row, and the entry tier evicts those
 *  users' live sockets (W7a): a revoked cookie the SSE generator already froze its Principal from would
 *  otherwise keep streaming until the socket died of natural causes. */
export async function revokeAllForExternalId(db: Db, externalId: ExternalId, revokedAt: number): Promise<{ id: SessionId; userId: UserId }[]> {
  return await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(inArray(sessions.userId, db.select({ id: users.id }).from(users).where(eq(users.externalId, externalId))), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id, userId: sessions.userId });
}

export async function listForUser(db: Db, userId: UserId): Promise<SessionView[]> {
  const rows = await db
    .select({
      id: sessions.id,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt))
    .limit(SESSION_LIST_HARD_CAP);
  return rows;
}
