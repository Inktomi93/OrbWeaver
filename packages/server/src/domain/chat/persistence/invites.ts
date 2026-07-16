// domain/chat/persistence/invites — the chat_invites reads + the atomic redeem (the one human
// participant-insert chokepoint) + pending_turns host-offline deferred-turn reads/writes. The redeem's
// maxUses/expiry/targeting TOCTOU is closed by a single conditional UPDATE … RETURNING. The token is never
// raw here — lookups key on the peppered `tokenHash` the verb computes.

import type { Db } from "@orb/db";
import { chatInvites, chatParticipants, pendingTurns } from "@orb/db";
import type { ChatId, ChatInviteId, ChatParticipantId, PendingTurnId, UserId } from "@orb/kit/ids";
import { and, asc, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { upsertMemberOnJoin } from "./participant";
import { loadMaxMessageSeq } from "./queries";

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
    readonly now: number;
  },
): Promise<{ inviteId: ChatInviteId; chatId: ChatId; participant: typeof chatParticipants.$inferSelect } | undefined> {
  const claimed = await db
    .update(chatInvites)
    .set({
      uses: sql`${chatInvites.uses} + 1`,
      status: sql`case when ${chatInvites.maxUses} is not null and ${chatInvites.uses} + 1 >= ${chatInvites.maxUses} then 'accepted' else ${chatInvites.status} end`,
    })
    .where(
      and(
        eq(chatInvites.tokenHash, params.tokenHash),
        eq(chatInvites.status, "pending"),
        or(isNull(chatInvites.maxUses), lt(chatInvites.uses, chatInvites.maxUses)),
        or(isNull(chatInvites.expiresAt), gt(chatInvites.expiresAt, params.now)),
        // Targeting: an untargeted invite redeems for anyone; a targeted one ONLY for its invitedUserId.
        or(isNull(chatInvites.invitedUserId), eq(chatInvites.invitedUserId, params.userId)),
        // Idempotent re-redeem: a caller already present in this invite's chat burns no use, flips no status.
        sql`not exists (select 1 from ${chatParticipants} where ${chatParticipants.chatId} = ${chatInvites.chatId} and ${chatParticipants.userId} = ${params.userId} and ${chatParticipants.leftSeq} is null)`,
      ),
    )
    .returning({ id: chatInvites.id, chatId: chatInvites.chatId });
  const invite = claimed.at(0);
  if (invite === undefined) {
    return;
  }
  const joinSeq = await loadMaxMessageSeq(db, invite.chatId);
  const participant = await upsertMemberOnJoin(db, {
    participantId: params.participantId,
    chatId: invite.chatId,
    userId: params.userId,
    joinSeq,
    now: params.now,
  });
  if (participant === undefined) {
    // Already a present member (idempotent no-op) — surface as not-redeemable, not a phantom membership.
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
    readonly now: number;
  },
): Promise<{ inviteId: ChatInviteId; chatId: ChatId; participant: typeof chatParticipants.$inferSelect } | undefined> {
  const claimed = await db
    .update(chatInvites)
    .set({
      uses: sql`${chatInvites.uses} + 1`,
      status: sql`case when ${chatInvites.maxUses} is not null and ${chatInvites.uses} + 1 >= ${chatInvites.maxUses} then 'accepted' else ${chatInvites.status} end`,
    })
    .where(
      and(
        eq(chatInvites.id, params.inviteId),
        eq(chatInvites.status, "pending"),
        or(isNull(chatInvites.maxUses), lt(chatInvites.uses, chatInvites.maxUses)),
        or(isNull(chatInvites.expiresAt), gt(chatInvites.expiresAt, params.now)),
        eq(chatInvites.invitedUserId, params.userId),
        // Idempotent re-accept: a caller who is already a present member burns no use, flips no status.
        sql`not exists (select 1 from ${chatParticipants} where ${chatParticipants.chatId} = ${chatInvites.chatId} and ${chatParticipants.userId} = ${params.userId} and ${chatParticipants.leftSeq} is null)`,
      ),
    )
    .returning({ id: chatInvites.id, chatId: chatInvites.chatId });
  const invite = claimed.at(0);
  if (invite === undefined) {
    return;
  }
  const joinSeq = await loadMaxMessageSeq(db, invite.chatId);
  const participant = await upsertMemberOnJoin(db, {
    participantId: params.participantId,
    chatId: invite.chatId,
    userId: params.userId,
    joinSeq,
    now: params.now,
  });
  if (participant === undefined) {
    // Already a present member (idempotent no-op) — surface as not-seatable, not a phantom membership.
    return;
  }
  return { inviteId: invite.id, chatId: invite.chatId, participant };
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

/** The deferred turns queued for a chat (drain at host return), oldest-first. */
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
