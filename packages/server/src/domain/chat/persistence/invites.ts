// domain/chat/persistence/invites — the chat_invites reads + the atomic redeem (the one human
// participant-insert chokepoint) + pending_turns host-offline deferred-turn reads/writes. The redeem's
// maxUses/expiry/targeting TOCTOU is closed by a single conditional UPDATE … RETURNING. The token is never
// raw here — lookups key on the peppered `tokenHash` the verb computes.
//
// THE JOIN FLOOR IS RESOLVED IN-BATCH (#1403), never pre-read: `insertMemberAfterInviteClaimStatement`
// stamps `joinSeq` from a scalar subquery over `messages`, so a message committed while the redeem is in
// flight can never land ABOVE the floor the seat records. Both redeem doors below share that builder.

import type { AuthMode } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatInvites, chatParticipants, pendingTurns } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ChatId, ChatInviteId, ChatParticipantId, PendingTurnId, PersonaId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { insertMemberAfterInviteClaimStatement } from "./participant.ts";

/** Lookup an invite by its peppered token hash. The validity gate is the verb's + {@link redeemInviteAtomic}. */
export async function findInviteByTokenHash(db: Db, tokenHash: string): Promise<typeof chatInvites.$inferSelect | undefined> {
  const rows = await db.select().from(chatInvites).where(eq(chatInvites.tokenHash, tokenHash)).limit(1);
  return rows.at(0);
}

/** Lookup an invite by its PK. The row is never surfaced to a caller who isn't the bound target. */
export async function findInviteById(db: Db, inviteId: ChatInviteId): Promise<typeof chatInvites.$inferSelect | undefined> {
  const rows = await db.select().from(chatInvites).where(eq(chatInvites.id, inviteId)).limit(1);
  return rows.at(0);
}

/** The subset of `inviteIds` that are STILL PENDING **and still targeted at this user** (#1799 — the read
 *  behind `InboxView.actionable`). Both predicates are the point: `status = 'pending'` excludes an invite
 *  that was accepted, declined, revoked or expired ANYWHERE (a share-link accept, a host revoke, or the
 *  #1501 accept whose follow-up dismiss failed), and `invited_user_id = :user` is what stops the read from
 *  becoming an existence oracle over invites belonging to other people's rooms. An untargeted share-link
 *  invite is never in the answer — it addresses nobody, so nobody's inbox is waiting on it.
 *  Empty `inviteIds` returns empty without touching the db (`inArray` on an empty list is a SQL error). */
export async function selectStandingInviteIds(db: Db, invitedUserId: UserId, inviteIds: readonly ChatInviteId[]): Promise<ChatInviteId[]> {
  if (inviteIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({ id: chatInvites.id })
    .from(chatInvites)
    .where(and(inArray(chatInvites.id, [...inviteIds]), eq(chatInvites.invitedUserId, invitedUserId), eq(chatInvites.status, "pending")));
  return rows.map((row) => row.id);
}

/** Every invite for a chat, newest-first. The token hash never leaves persistence. */
export async function listInvitesForChat(db: Db, chatId: ChatId): Promise<(typeof chatInvites.$inferSelect)[]> {
  return await db.select().from(chatInvites).where(eq(chatInvites.chatId, chatId)).orderBy(desc(chatInvites.createdAt));
}

/** Count the present human members of a chat. `leftSeq IS NULL` = present. */
export async function countPresentMembers(db: Db, chatId: ChatId): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "human"), isNull(chatParticipants.leftSeq)));
  return rows.at(0)?.n ?? 0;
}

/** Insert a host-minted invite (the token already CSPRNG-minted + hashed by the verb). */
export async function insertInvite(db: Db, row: typeof chatInvites.$inferInsert): Promise<void> {
  await db.insert(chatInvites).values(row);
}

/** The atomic redeem — the one human participant-insert chokepoint. A single conditional UPDATE …
 *  RETURNING closes the maxUses/expiry/targeting TOCTOU; a contended/expired/exhausted/non-target claim
 *  matches nothing. The caller-not-already-present predicate makes a re-redeem by a present member
 *  idempotent (no burned use, no status flip). Returns the joined chat id + participant row, or `undefined`. */
export async function redeemInviteAtomic(
  db: Db,
  params: {
    readonly tokenHash: string;
    readonly userId: UserId;
    readonly participantId: ChatParticipantId;
    /** The joiner's seed persona (the verb runs the same chain `startChat` runs for the host seat). `null` =
     *  the joiner holds no persona — an honest floor, never the room's anchor. */
    readonly activePersonaId: PersonaId | null;
    readonly now: number;
  },
): Promise<{ inviteId: ChatInviteId; chatId: ChatId; participant: typeof chatParticipants.$inferSelect } | undefined> {
  const candidate = await findInviteByTokenHash(db, params.tokenHash);
  if (candidate === undefined) {
    return;
  }
  const eligible = and(
    eq(chatInvites.tokenHash, params.tokenHash),
    eq(chatInvites.status, "pending"),
    or(isNull(chatInvites.maxUses), lt(chatInvites.uses, chatInvites.maxUses)),
    or(isNull(chatInvites.expiresAt), gt(chatInvites.expiresAt, params.now)),
    or(isNull(chatInvites.invitedUserId), eq(chatInvites.invitedUserId, params.userId)),
  );
  const claimedStatement = db
    .update(chatInvites)
    .set({
      uses: sql`${chatInvites.uses} + 1`,
      status: sql`case when ${chatInvites.maxUses} is not null and ${chatInvites.uses} + 1 >= ${chatInvites.maxUses} then 'accepted' else ${chatInvites.status} end`,
    })
    .where(
      and(
        eligible,
        sql`not exists (select 1 from ${chatParticipants} where ${chatParticipants.chatId} = ${chatInvites.chatId} and ${chatParticipants.userId} = ${params.userId} and ${chatParticipants.leftSeq} is null)`,
      ),
    )
    .returning({ id: chatInvites.id, chatId: chatInvites.chatId });
  const seatedStatement = insertMemberAfterInviteClaimStatement(db, {
    participantId: params.participantId,
    inviteId: candidate.id,
    userId: params.userId,
    activePersonaId: params.activePersonaId,
    now: params.now,
  });
  const results = await db.batch(batchMany([claimedStatement, seatedStatement]));
  const claimed = results[0] as { id: ChatInviteId; chatId: ChatId }[];
  const seated = results[1] as (typeof chatParticipants.$inferSelect)[];
  const invite = claimed.at(0);
  const participant = seated.at(0);
  if (invite === undefined || participant === undefined) {
    return;
  }
  return { inviteId: invite.id, chatId: invite.chatId, participant };
}

/** The atomic accept-by-id — the token-free notification→accept sibling of {@link redeemInviteAtomic}. Same
 *  chokepoint physics, but self-authorizing: the WHERE demands an exact target match (invitedUserId =
 *  caller), so a share-link (invitedUserId IS NULL) or foreign-targeted invite matches nothing — both
 *  collapse to the same leak-free `undefined` an invalid id gives. */
export async function acceptInviteByIdAtomic(
  db: Db,
  params: {
    readonly inviteId: ChatInviteId;
    readonly userId: UserId;
    readonly participantId: ChatParticipantId;
    /** The joiner's seed persona — see {@link redeemInviteAtomic}. */
    readonly activePersonaId: PersonaId | null;
    readonly now: number;
  },
): Promise<{ inviteId: ChatInviteId; chatId: ChatId; participant: typeof chatParticipants.$inferSelect } | undefined> {
  const candidate = await findInviteById(db, params.inviteId);
  if (candidate === undefined) {
    return;
  }
  const eligible = and(
    eq(chatInvites.id, params.inviteId),
    eq(chatInvites.status, "pending"),
    or(isNull(chatInvites.maxUses), lt(chatInvites.uses, chatInvites.maxUses)),
    or(isNull(chatInvites.expiresAt), gt(chatInvites.expiresAt, params.now)),
    eq(chatInvites.invitedUserId, params.userId),
  );
  const claimedStatement = db
    .update(chatInvites)
    .set({
      uses: sql`${chatInvites.uses} + 1`,
      status: sql`case when ${chatInvites.maxUses} is not null and ${chatInvites.uses} + 1 >= ${chatInvites.maxUses} then 'accepted' else ${chatInvites.status} end`,
    })
    .where(
      and(
        eligible,
        sql`not exists (select 1 from ${chatParticipants} where ${chatParticipants.chatId} = ${chatInvites.chatId} and ${chatParticipants.userId} = ${params.userId} and ${chatParticipants.leftSeq} is null)`,
      ),
    )
    .returning({ id: chatInvites.id, chatId: chatInvites.chatId });
  const seatedStatement = insertMemberAfterInviteClaimStatement(db, {
    participantId: params.participantId,
    inviteId: candidate.id,
    userId: params.userId,
    activePersonaId: params.activePersonaId,
    now: params.now,
  });
  const results = await db.batch(batchMany([claimedStatement, seatedStatement]));
  const claimed = results[0] as { id: ChatInviteId; chatId: ChatId }[];
  const seated = results[1] as (typeof chatParticipants.$inferSelect)[];
  const invite = claimed.at(0);
  const participant = seated.at(0);
  if (invite === undefined || participant === undefined) {
    return;
  }
  return { inviteId: invite.id, chatId: invite.chatId, participant };
}

/** The keys a signup admission is evaluated at: the peppered token hash, the server clock and the live mode. */
interface SignupAdmissionKey {
  readonly tokenHash: string;
  readonly now: number;
  readonly mode: AuthMode;
}

/** D259 — what a signup invite must satisfy to admit one more account. The pre-check, the account insert
 *  and the claim all read this one predicate, so the account insert and the claim cannot disagree. */
function signupInviteAdmits(key: SignupAdmissionKey): SQL {
  return sql.join(
    [
      eq(chatInvites.tokenHash, key.tokenHash),
      eq(chatInvites.status, "pending"),
      eq(chatInvites.allowSignup, true),
      eq(chatInvites.mintMode, key.mode),
      isNull(chatInvites.invitedUserId),
      isNotNull(chatInvites.maxUses),
      lt(chatInvites.uses, chatInvites.maxUses),
      gt(chatInvites.expiresAt, key.now),
    ],
    sql` and `,
  );
}

/** The admission the sessions account insert carries in its own WHERE (D259). Sessions reads no chat table:
 *  this `SQL` is opaque to it. */
export function signupAccountAdmission(key: SignupAdmissionKey): SQL {
  return sql`exists (select 1 from ${chatInvites} where ${signupInviteAdmits(key)})`;
}

/** The signup invite the key admits right now, or `undefined`. The pre-check before any password hashing. */
export async function findAdmittingSignupInvite(
  db: Db,
  key: SignupAdmissionKey,
): Promise<{ readonly id: ChatInviteId; readonly chatId: ChatId; readonly createdByUserId: UserId | null } | undefined> {
  const rows = await db
    .select({ id: chatInvites.id, chatId: chatInvites.chatId, createdByUserId: chatInvites.createdByUserId })
    .from(chatInvites)
    .where(signupInviteAdmits(key))
    .limit(1);
  return rows.at(0);
}

/**
 * D259 — the signup redeem as ONE batch: any `leading` statements (the OIDC pending take), the account insert
 * gated on the admission (and on the take), then the claim gated on the admission and on the account insert
 * having written a row, then the seat and the audit row, each gated on the statement before it having written
 * a row. `changes()` reads the statement immediately before, so a refused step zeroes the rest of the chain,
 * and a thrown unique violation rolls it all back. Reports the account, claim and seat row counts; the verb
 * owns what they mean.
 */
export async function redeemSignupAtomic(
  db: Db,
  params: SignupAdmissionKey & {
    readonly leading: readonly BatchStmt[];
    readonly account: AwaitableBatchStmt<{ id: UserId }[]>;
    /** The joiner's persona insert (persona-owned), gated on the claim; the seat after it is gated on it. */
    readonly persona: AwaitableBatchStmt<{ id: PersonaId }[]>;
    readonly personaId: PersonaId;
    /** The new account's settings row naming that persona (settings-owned), gated on the persona insert. */
    readonly pointers: AwaitableBatchStmt<{ userId: UserId }[]>;
    readonly audit: BatchStmt;
    readonly inviteId: ChatInviteId;
    readonly userId: UserId;
    readonly participantId: ChatParticipantId;
  },
): Promise<{ readonly accounts: number; readonly claims: number; readonly personas: number; readonly pointers: number; readonly seats: number }> {
  const claim = db
    .update(chatInvites)
    .set({
      uses: sql`${chatInvites.uses} + 1`,
      status: sql`case when ${chatInvites.uses} + 1 >= ${chatInvites.maxUses} then 'accepted' else ${chatInvites.status} end`,
    })
    .where(sql`${signupInviteAdmits(params)} and changes() > 0`)
    .returning({ id: chatInvites.id });
  // The seat's `changes() > 0` reads the pointer write, which reads the persona insert, so the joiner is seated only
  // as the persona they named, and that persona is already the one they speak as.
  const seat = insertMemberAfterInviteClaimStatement(db, {
    participantId: params.participantId,
    inviteId: params.inviteId,
    userId: params.userId,
    activePersonaId: params.personaId,
    now: params.now,
  });
  const results = await db.batch(batchMany([...params.leading, params.account, claim, params.persona, params.pointers, seat, params.audit]));
  const [accounts, claims, personas, pointers, seats] = results.slice(params.leading.length) as readonly (readonly unknown[])[];
  return {
    accounts: accounts?.length ?? 0,
    claims: claims?.length ?? 0,
    personas: personas?.length ?? 0,
    pointers: pointers?.length ?? 0,
    seats: seats?.length ?? 0,
  };
}

/** Host-revoke a still-pending invite (atomic). Returns true iff it flipped. */
export async function revokeInviteById(db: Db, inviteId: ChatInviteId, chatId: ChatId): Promise<boolean> {
  const rows = await db
    .update(chatInvites)
    .set({ status: "revoked" })
    .where(and(eq(chatInvites.id, inviteId), eq(chatInvites.chatId, chatId), eq(chatInvites.status, "pending")))
    .returning({ id: chatInvites.id });
  return rows.length > 0;
}

/** Invitee-decline a still-pending targeted invite by id. Scoped to the caller as the target — a foreign /
 *  non-targeted / already-settled invite never matches (leak-free, idempotent). */
export async function declineInviteById(db: Db, inviteId: ChatInviteId, invitedUserId: UserId): Promise<boolean> {
  const rows = await db
    .update(chatInvites)
    .set({ status: "declined" })
    .where(and(eq(chatInvites.id, inviteId), eq(chatInvites.status, "pending"), eq(chatInvites.invitedUserId, invitedUserId)))
    .returning({ id: chatInvites.id });
  return rows.length > 0;
}

// ── pending_turns — the host-offline deferred turn (not lock-held, boot-reclaimed) ──

/** Record a deferred AI turn (host offline). Not lock-held — the lock TTL would stale-takeover into a
 *  double-run; this drains + re-validates at host return / boot. */
export async function insertPendingTurn(db: Db, row: typeof pendingTurns.$inferInsert): Promise<void> {
  await db.insert(pendingTurns).values(row);
}

/** ATOMICALLY claim (delete) one deferred turn by id — the drain's serializer. A drained turn is NOT
 *  lock-held, so this `DELETE … RETURNING` is the ONLY thing that makes a row run exactly once: the boot
 *  reclaim (`{all}`) and a host-return drain (`{hostUserId}`) can hold overlapping candidate snapshots, but
 *  only one `DELETE` matches — the winner gets the row, the loser gets `undefined` and skips. A transient
 *  fault re-inserts the row to retry; a completed/dropped turn stays deleted. */
export async function claimPendingTurn(db: Db, id: PendingTurnId): Promise<typeof pendingTurns.$inferSelect | undefined> {
  const rows = await db.delete(pendingTurns).where(eq(pendingTurns.id, id)).returning();
  return rows.at(0);
}

/** The deferred turns queued for ONE chat, oldest-first. NOT the production drain scope — the host-return
 *  drain (chat Part III §5, wired at `transport/trpc/routers/stream.ts`'s `connect`) scopes by the
 *  returning host across ALL their chats via {@link loadPendingTurnsForHost}, since a host's reconnect
 *  should reclaim every chat they fund at once, not one chat at a time. This chat-scoped sibling is the
 *  precise read for asserting a single chat's queue state (used throughout the `turn`/`invites` int
 *  suites) and remains available for a future per-chat "reply pending" surface.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function loadPendingTurns(db: Db, chatId: ChatId): Promise<(typeof pendingTurns.$inferSelect)[]> {
  return await db.select().from(pendingTurns).where(eq(pendingTurns.chatId, chatId)).orderBy(asc(pendingTurns.createdAt));
}

/** All deferred turns across chats — the boot-reclaim drain. Oldest-first. */
export async function loadPendingTurnsForReclaim(db: Db): Promise<(typeof pendingTurns.$inferSelect)[]> {
  return await db.select().from(pendingTurns).orderBy(asc(pendingTurns.createdAt));
}

/** The deferred turns FUNDED by one host's box (`runAsUserId`) — the host-return drain, oldest-first. When
 *  that host reconnects, their queued turns can run on their now-live box. */
export async function loadPendingTurnsForHost(db: Db, runAsUserId: UserId): Promise<(typeof pendingTurns.$inferSelect)[]> {
  return await db.select().from(pendingTurns).where(eq(pendingTurns.runAsUserId, runAsUserId)).orderBy(asc(pendingTurns.createdAt));
}
