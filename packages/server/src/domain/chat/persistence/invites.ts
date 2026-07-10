// domain/chat/persistence/invites — the `chat_invites` reads + the ATOMIC REDEEM (the ONE human participant-
// insert chokepoint, Part III §2) + the `pending_turns` host-offline deferred-turn reads/writes. QUERIES ONLY:
// the redeem's `maxUses`/expiry/TARGETING TOCTOU is closed by a single conditional `UPDATE … RETURNING`
// (redeem/decline enforce `invitedUserId` in the WHERE — atomic with the state change; preview's targeting is
// the verb's read-side check); AUTH_MODE / host authority are the verbs'. The token is NEVER raw here — lookups key on the peppered
// `tokenHash` the verb computes (mirror the `sessions` token discipline); this layer never sees the raw token.

import type { Db } from "@orb/db";
import { chatInvites, chatParticipants, pendingTurns } from "@orb/db";
import type { ChatId, ChatInviteId, ChatParticipantId, PendingTurnId, UserId } from "@orb/kit/ids";
import { and, asc, count, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { upsertMemberOnJoin } from "./participant";
import { loadMaxMessageSeq } from "./queries";

/** Lookup an invite by its peppered token hash (preview / targeting / expiry checks). Returns the raw row or
 *  `undefined`; the validity GATE is the verb's (status/targeting) + the atomic {@link redeemInviteAtomic}. */
export async function findInviteByTokenHash(
  db: Db,
  tokenHash: string,
): Promise<typeof chatInvites.$inferSelect | undefined> {
  const rows = await db
    .select()
    .from(chatInvites)
    .where(eq(chatInvites.tokenHash, tokenHash))
    .limit(1);
  return rows.at(0);
}

/** The host-management invite list (createInvite/revoke surface) — every invite for a chat, newest-first. The
 *  verb maps to `InviteView` (computing `remainingUses`); the token hash never leaves persistence. */
export async function listInvitesForChat(
  db: Db,
  chatId: ChatId,
): Promise<(typeof chatInvites.$inferSelect)[]> {
  return await db
    .select()
    .from(chatInvites)
    .where(eq(chatInvites.chatId, chatId))
    .orderBy(desc(chatInvites.createdAt));
}

/** Count the PRESENT human members of a chat (the `InvitePreview.memberCount` — Part III §2; humans are the
 *  "members", a character is cast). `leftSeq IS NULL` = present. */
export async function countPresentMembers(db: Db, chatId: ChatId): Promise<number> {
  const rows = await db
    .select({ n: count() })
    .from(chatParticipants)
    .where(
      and(
        eq(chatParticipants.chatId, chatId),
        eq(chatParticipants.kind, "human"),
        isNull(chatParticipants.leftSeq),
      ),
    );
  return rows.at(0)?.n ?? 0;
}

/** Insert a host-minted invite (the token already CSPRNG-minted + HASHED by the verb). `status` defaults
 *  `pending`; `uses` defaults 0. */
export async function createInvite(db: Db, row: typeof chatInvites.$inferInsert): Promise<void> {
  await db.insert(chatInvites).values(row);
}

/**
 * The ATOMIC redeem (Part III §2 — the ONE human participant-insert chokepoint). Step 1 is the TOCTOU-closing
 * conditional `UPDATE chat_invites SET uses=uses+1 (… → 'accepted' once exhausted) WHERE tokenHash AND status='pending' AND remaining>0 AND not-expired AND (untargeted OR target=caller) AND caller-not-already-present RETURNING`
 * — a contended/expired/exhausted invite matches
 * nothing (→ `undefined`). TARGETING is enforced HERE, atomic with the use-increment (mirror
 * {@link declineInviteById}; the `previewInvite` target semantics — an untargeted `invitedUserId=null` invite
 * redeems for anyone, a targeted one ONLY for its `invitedUserId`): a non-target's claim matches nothing → it
 * never burns a use nor flips status, and the verb surfaces the same leak-free NOT_FOUND an invalid token
 * gives. The `caller-not-already-present` predicate makes a re-redeem by a PRESENT member idempotent (no burned
 * use, no status flip — the F5 fix): a bookmarked /join re-fire on a finite invite never consumes a remaining
 * use, and the verb's recovery path returns their existing membership. Step 2 stamps the participant via the
 * same {@link upsertMemberOnJoin} re-add upsert (`role` server-forced `member`, `joinSeq`=current canon head —
 * history replays from there AFTER accept); its `undefined` no-op is now reachable ONLY under a concurrent
 * same-user double-redeem race (both UPDATEs pass the not-present check before either upsert lands). Returns the
 * joined chat id + the participant row, or `undefined` if the invite was not redeemable.
 */
export async function redeemInviteAtomic(
  db: Db,
  params: {
    readonly tokenHash: string;
    readonly userId: UserId;
    readonly participantId: ChatParticipantId;
    readonly now: number;
  },
): Promise<
  | { inviteId: ChatInviteId; chatId: ChatId; participant: typeof chatParticipants.$inferSelect }
  | undefined
> {
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
        // Targeting: an untargeted invite redeems for anyone; a targeted one ONLY for its `invitedUserId`.
        or(isNull(chatInvites.invitedUserId), eq(chatInvites.invitedUserId, params.userId)),
        // Idempotent re-redeem: a caller who is ALREADY a PRESENT member of this invite's chat burns no use and
        // flips no status (mirror `upsertMemberOnJoin`'s `(chatId,userId)` no-op — `leftSeq IS NULL` = present).
        // A bookmarked /join re-fire on a finite multi-use invite thus never eats a remaining use (the verb's
        // recovery path re-reads their existing membership); a PREVIOUSLY-LEFT member still re-redeems + re-joins.
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
    // Already a present member (the upsert was an idempotent no-op) — surface as not-redeemable so the verb
    // reports "already joined" rather than a phantom membership.
    return;
  }
  return { inviteId: invite.id, chatId: invite.chatId, participant };
}

/** Host-revoke a still-pending invite (atomic — `WHERE status='pending'`). Returns true iff it flipped. */
export async function revokeInvite(
  db: Db,
  inviteId: ChatInviteId,
  chatId: ChatId,
): Promise<boolean> {
  const rows = await db
    .update(chatInvites)
    .set({ status: "revoked" })
    .where(
      and(
        eq(chatInvites.id, inviteId),
        eq(chatInvites.chatId, chatId),
        eq(chatInvites.status, "pending"),
      ),
    )
    .returning({ id: chatInvites.id });
  return rows.length > 0;
}

/** Invitee-decline a still-pending invite by token hash (first-class — Part III §2; targeting is the verb's).
 *  Atomic on `status='pending'`. Returns true iff it flipped. */
export async function declineInvite(db: Db, tokenHash: string): Promise<boolean> {
  const rows = await db
    .update(chatInvites)
    .set({ status: "declined" })
    .where(and(eq(chatInvites.tokenHash, tokenHash), eq(chatInvites.status, "pending")))
    .returning({ id: chatInvites.id });
  return rows.length > 0;
}

/** Invitee-decline a still-pending TARGETED invite by its id (PD-67 — the notification-driven decline path;
 *  the token-hash twin above serves the link path). Atomic + scoped to the caller as the target
 *  (`invitedUserId` must match) — a foreign / non-targeted / already-settled invite never matches
 *  (leak-free, idempotent). Returns true iff it flipped. */
export async function declineInviteById(
  db: Db,
  inviteId: ChatInviteId,
  invitedUserId: UserId,
): Promise<boolean> {
  const rows = await db
    .update(chatInvites)
    .set({ status: "declined" })
    .where(
      and(
        eq(chatInvites.id, inviteId),
        eq(chatInvites.status, "pending"),
        eq(chatInvites.invitedUserId, invitedUserId),
      ),
    )
    .returning({ id: chatInvites.id });
  return rows.length > 0;
}

// ── pending_turns — the host-offline DEFERRED turn (Part III §5; NOT lock-held, boot-reclaimed) ──

/** Record a deferred AI turn (host offline). Carries the D19 identity split: `triggeredBy` (the responsible
 *  human) + `runAsUserId` (the authorized host whose box funds it). NOT lock-held — the 5-min lock TTL would
 *  stale-takeover into a double-run; this drains + re-validates at host return / boot. */
export async function insertPendingTurn(
  db: Db,
  row: typeof pendingTurns.$inferInsert,
): Promise<void> {
  await db.insert(pendingTurns).values(row);
}

/** Drop a drained/cancelled deferred turn by id. */
export async function deletePendingTurn(db: Db, id: PendingTurnId): Promise<void> {
  await db.delete(pendingTurns).where(eq(pendingTurns.id, id));
}

/** The deferred turns queued for a chat (drain at host return), oldest-first. */
export async function loadPendingTurns(
  db: Db,
  chatId: ChatId,
): Promise<(typeof pendingTurns.$inferSelect)[]> {
  return await db
    .select()
    .from(pendingTurns)
    .where(eq(pendingTurns.chatId, chatId))
    .orderBy(asc(pendingTurns.createdAt));
}

/** ALL deferred turns across chats — the boot-reclaim drain (`reclaimChatLocksOnBoot`'s sibling: re-validate
 *  consent/budget, then run or drop). Oldest-first. */
export async function loadPendingTurnsForReclaim(
  db: Db,
): Promise<(typeof pendingTurns.$inferSelect)[]> {
  return await db.select().from(pendingTurns).orderBy(asc(pendingTurns.createdAt));
}
