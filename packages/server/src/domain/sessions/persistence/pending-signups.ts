// The OIDC pending-join rows (D254). A row is written at the callback, read by the preview, and taken by the
// confirm's own batch through `takePendingSignupStatement`, whose expiry-gated DELETE is what makes a pending
// join single-use. The OIDC transaction store never reads this table.

import type { UserRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { oidcPendingSignups, users } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import type { Sealed } from "#infra/crypto";

/** A pending join as the callback writes it. */
interface PendingSignupWrite {
  readonly externalId: ExternalId;
  readonly secretHash: string;
  readonly handle: Handle;
  readonly email: string | null;
  readonly groups: readonly string[];
  readonly inviteTokenHash: string;
  readonly idToken: Sealed | null;
  readonly createdAt: number;
  readonly expiresAt: number;
}

/** Write or REPLACE the one pending join for this subject: a second callback supersedes the first, so a
 *  subject never holds two live secrets. */
export async function upsertPendingSignup(db: Db, row: PendingSignupWrite): Promise<void> {
  const values = {
    secretHash: row.secretHash,
    handle: row.handle,
    email: row.email,
    groups: [...row.groups],
    inviteTokenHash: row.inviteTokenHash,
    idTokenCiphertext: row.idToken?.ciphertext ?? null,
    idTokenIv: row.idToken?.iv ?? null,
    idTokenTag: row.idToken?.tag ?? null,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
  await db
    .insert(oidcPendingSignups)
    .values({ externalId: row.externalId, ...values })
    .onConflictDoUpdate({ target: oidcPendingSignups.externalId, set: values });
}

/** The live pending join under this secret hash, or undefined (none, or past its window). */
export async function selectLivePendingSignup(db: Db, secretHash: string, now: number): Promise<typeof oidcPendingSignups.$inferSelect | undefined> {
  const rows = await db
    .select()
    .from(oidcPendingSignups)
    .where(and(eq(oidcPendingSignups.secretHash, secretHash), gt(oidcPendingSignups.expiresAt, now)))
    .limit(1);
  return rows.at(0);
}

/** The sealed id_token a pending row carries, or null. */
export function sealedIdTokenOfPending(row: typeof oidcPendingSignups.$inferSelect): Sealed | null {
  const { idTokenCiphertext: ciphertext, idTokenIv: iv, idTokenTag: tag } = row;
  return ciphertext !== null && iv !== null && tag !== null ? { ciphertext, iv, tag } : null;
}

/** The confirm's FIRST batch statement, unexecuted: take the live pending row under this secret hash. A row
 *  that is gone, replaced or past its window deletes nothing, and every later statement in the batch gates
 *  on `changes() > 0`. */
export function takePendingSignupStatement(db: Db, secretHash: string, now: number): BatchStmt {
  return batchStmt(
    db
      .delete(oidcPendingSignups)
      .where(and(eq(oidcPendingSignups.secretHash, secretHash), gt(oidcPendingSignups.expiresAt, now)))
      .returning({ externalId: oidcPendingSignups.externalId }),
  );
}

/** The SSO signup account a confirm writes. */
interface PendingSignupAccount {
  readonly id: UserId;
  readonly handle: Handle;
  readonly externalId: ExternalId;
  readonly email: string | null;
  readonly role: UserRole;
  readonly enabled: boolean;
  readonly at: number;
}

/**
 * D254 — the confirm's account insert, UNEXECUTED. It writes only where the pending take before it deleted a
 * row, `admission` (chat's opaque invite predicate) holds, and no row carries the email. Handle, subject and
 * owner collisions are the unique indexes' job: there is no `onConflictDoNothing`, so a race throws and
 * rolls the batch back. Positional over the declared column order, like `insertSignupUserStatement`.
 */
export function insertPendingSignupUserStatement(db: Db, row: PendingSignupAccount, admission: SQL): AwaitableBatchStmt<{ id: UserId }[]> {
  const emailFree = row.email === null ? sql`1 = 1` : sql`not exists (select 1 from ${users} where ${users.email} = ${row.email})`;
  return db
    .insert(users)
    .select(
      sql`select ${row.id}, ${row.handle}, ${row.externalId}, ${row.email}, ${row.role}, ${row.enabled ? 1 : 0}, null, 'human', null, ${row.at}, ${row.at} where changes() > 0 and ${admission} and ${emailFree}`,
    )
    .returning({ id: users.id });
}

/** The reaper: every pending join past its window. Returns how many went. */
export async function deleteExpiredPendingSignups(db: Db, before: number): Promise<number> {
  const reaped = await db.delete(oidcPendingSignups).where(lte(oidcPendingSignups.expiresAt, before)).returning({ externalId: oidcPendingSignups.externalId });
  return reaped.length;
}
