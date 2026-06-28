import type { UserRole } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import { sessions, users } from "@orb/db";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { and, asc, eq, isNull } from "drizzle-orm";

// domain/sessions/persistence/sessions — ALL `sessions`-table access (queries only; the verbs hold the
// business logic). Every timestamp arrives as a PARAM (the verb passes its injected clock) — no ambient
// `Date.now()` here (determinism). The token is never stored; lookups key on the peppered `tokenHash`.
//
// The query SHAPES (insert row / validation row) are file-local, NOT exported: callers pass object
// literals + read the inferred return, so no feature type leaks out of `persistence/` (no-inline-types).

/** A new session row (the verb mints id + token + computes hash/expiry from its injected clock). */
interface SessionInsert {
  id: SessionId;
  userId: UserId;
  tokenHash: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
  userAgent: string | null;
}

/** The `validate` JOIN read shape — session live-state + the owning user's resolution fields (the Route-A
 *  payload, D40). File-local: the verb reads it via inference, so no feature type leaks (no-inline-types). */
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

/** The per-request validate read: join the session to its user, keyed on the peppered token hash. Returns
 *  the session's live-state columns + the owning user's resolution fields (incl. `userId`/`role`/`enabled`,
 *  the Route-A payload — D40), branded straight off the schema's `$type<>` columns. */
export async function selectForValidation(
  db: Db,
  tokenHash: string,
): Promise<SessionValidationRow | undefined> {
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
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  return rows.at(0);
}

/** The throttled activity slide — bump `lastSeenAt` + `expiresAt` together. */
export async function slideExpiry(
  db: Db,
  sessionId: SessionId,
  lastSeenAt: number,
  expiresAt: number,
): Promise<void> {
  await db.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, sessionId));
}

/** Atomic logout: flip `revokedAt` only on a still-live row, RETURNING the owner so only the winning
 *  call audits (the loser matches nothing). */
export async function revokeByTokenHash(
  db: Db,
  tokenHash: string,
  revokedAt: number,
): Promise<{ id: SessionId; userId: UserId } | undefined> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id, userId: sessions.userId });
  return revoked.at(0);
}

/** Atomic admin kick of one device. */
export async function revokeById(db: Db, sessionId: SessionId, revokedAt: number): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

/** Atomic kick-all for a user (admin disable) → the ids actually flipped this call. */
export async function revokeAllForUser(
  db: Db,
  userId: UserId,
  revokedAt: number,
): Promise<SessionId[]> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return revoked.map((r) => r.id);
}

/** The admin device list — every session for a user, oldest-first; projected to the secret-free view. */
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
    .orderBy(asc(sessions.createdAt));
  return rows;
}
