import type { UserRole } from "@orb/contracts/identity";
import type { SessionView } from "@orb/contracts/session";
import type { Db } from "@orb/db";
import { sessions, users } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Sealed } from "#infra/crypto";

// domain/sessions/persistence/sessions — all `sessions`-table access (queries only). Every timestamp
// arrives as a param (no ambient Date.now()); the token is never stored, lookups key on `tokenHash`.
//
// #141 — THE SEALED OIDC id_token COLUMNS ARE WRITE-MOSTLY, and this file is the whole census. They are
// SET once at insert, NULLed by every revoke path, and READ by exactly one query (`revokeByTokenHash`'s
// RETURNING, which is the logout consuming its own end-session hint). No projection here selects them —
// `selectForValidation` and `listForUser` both enumerate their columns explicitly, so the blob cannot be
// swept into a per-request read or the admin device list by a later `select()` widening.

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
  /** #141 — the sealed OIDC id_token (AAD = `id`), or null for every non-OIDC mint. */
  oidcIdToken: Sealed | null;
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
  const { oidcIdToken, ...rest } = row;
  await db.insert(sessions).values({
    ...rest,
    // The three columns are written together or not at all — a half-written seal is an unopenable blob.
    oidcIdTokenCiphertext: oidcIdToken?.ciphertext ?? null,
    oidcIdTokenIv: oidcIdToken?.iv ?? null,
    oidcIdTokenTag: oidcIdToken?.tag ?? null,
  });
}

/** #141 — reassemble the sealed blob from its three columns, or null when any part is absent (a non-OIDC
 *  mint, a pre-#141 row, or an already-consumed hint). Partial ⇒ null: two thirds of a GCM seal is not a
 *  seal, and returning it would only produce a decrypt throw one layer up. */
function sealedIdTokenOf(row: { oidcIdTokenCiphertext: string | null; oidcIdTokenIv: string | null; oidcIdTokenTag: string | null }): Sealed | null {
  const { oidcIdTokenCiphertext: ciphertext, oidcIdTokenIv: iv, oidcIdTokenTag: tag } = row;
  if (ciphertext === null || iv === null || tag === null) {
    return null;
  }
  return { ciphertext, iv, tag };
}

/** #141 — the columns every revoke path clears alongside `revokedAt`. A revoked session must not keep its
 *  end-session hint at rest: the row is dead, nothing will ever send the hint again, and sessions are never
 *  hard-deleted, so without this the blobs accumulate for the life of the deployment. */
const CLEAR_OIDC_ID_TOKEN = { oidcIdTokenCiphertext: null, oidcIdTokenIv: null, oidcIdTokenTag: null } as const;

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
    // users.kind = 'human' — an agent principal is structurally sessionless (docs/work/0048).
    .where(and(eq(sessions.tokenHash, tokenHash), eq(users.kind, "human")))
    .limit(1);
  return rows.at(0);
}

export async function slideExpiry(db: Db, sessionId: SessionId, lastSeenAt: number, expiresAt: number): Promise<void> {
  await db.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, sessionId));
}

/**
 * Flips revokedAt only on a still-live row, returning the owner so only the winning call audits — plus the
 * SEALED id_token that row was carrying (#141), which is the logout's end-session hint.
 *
 * THE CLEAR IS A SECOND STATEMENT ON PURPOSE, and it cannot be folded into the first: SQLite's `RETURNING`
 * reports the POST-update values, so a single `SET revokedAt, <cols>=NULL … RETURNING <cols>` would hand
 * back three NULLs and silently lose the hint. The atomicity that matters is unaffected — the
 * `revokedAt IS NULL` guard means exactly one caller ever gets the row, and that one caller both reads and
 * clears. A crash between the two leaves an encrypted blob on a dead row, which is inert.
 */
export async function revokeByTokenHash(
  db: Db,
  tokenHash: string,
  revokedAt: number,
): Promise<{ id: SessionId; userId: UserId; oidcIdToken: Sealed | null } | undefined> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt })
    .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
    .returning({
      id: sessions.id,
      userId: sessions.userId,
      oidcIdTokenCiphertext: sessions.oidcIdTokenCiphertext,
      oidcIdTokenIv: sessions.oidcIdTokenIv,
      oidcIdTokenTag: sessions.oidcIdTokenTag,
    });
  const row = revoked.at(0);
  if (row === undefined) {
    return;
  }
  const oidcIdToken = sealedIdTokenOf(row);
  // UNCONDITIONAL (#1578). Gating this on `oidcIdToken !== null` asked the WRONG question: `sealedIdTokenOf`
  // returns null for a HALF-written seal too, so a row carrying a ciphertext without its iv/tag kept that
  // stray column forever — against this file's own rule that a revoked session holds no end-session hint at
  // rest. The clear is idempotent (a non-OIDC row is already all-null), so the honest predicate is none.
  await db.update(sessions).set(CLEAR_OIDC_ID_TOKEN).where(eq(sessions.id, row.id));
  return { id: row.id, userId: row.userId, oidcIdToken };
}

/** Flips revokedAt only on a still-live row, returning its OWNER (`undefined` = nothing to revoke) — the
 *  entry tier evicts that user's live sockets with it (W7a). */
export async function revokeById(db: Db, sessionId: SessionId, revokedAt: number): Promise<UserId | undefined> {
  const revoked = await db
    .update(sessions)
    .set({ revokedAt, ...CLEAR_OIDC_ID_TOKEN })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)))
    .returning({ userId: sessions.userId });
  return revoked.at(0)?.userId;
}

/** The UNEXECUTED kick-all — the same single atomic UPDATE {@link revokeAllForUser} runs, handed back so a
 *  caller whose OWN privileged write must not outlive the kick can commit both in one `db.batch` (#1691:
 *  a password reset whose revoke failed left the new credential live beside the old sessions). Awaitable on
 *  its own, so the executor below is the same statement, not a second spelling of it. */
export function revokeAllForUserStatement(db: Db, userId: UserId, revokedAt: number): AwaitableBatchStmt<{ id: SessionId }[]> {
  return db
    .update(sessions)
    .set({ revokedAt, ...CLEAR_OIDC_ID_TOKEN })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
}

export async function revokeAllForUser(db: Db, userId: UserId, revokedAt: number): Promise<SessionId[]> {
  const revoked = await revokeAllForUserStatement(db, userId, revokedAt);
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
    .set({ revokedAt, ...CLEAR_OIDC_ID_TOKEN })
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
