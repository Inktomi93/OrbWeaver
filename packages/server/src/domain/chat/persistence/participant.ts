// domain/chat/persistence/participant — the chat_participants kind-shape parser + the membership-lifecycle
// writes. Queries only: the shape-check/unique/atomic-upsert are db-level invariants this layer enforces;
// policy (who may join/kick/hand-off, targeting, AUTH_MODE gating) is the verbs'.
//
// The re-add upsert: a human (re)joins via a guarded atomic INSERT … ON CONFLICT(chatId,userId) DO UPDATE
// SET joinSeq=<head>, leftSeq=NULL, role='member' WHERE leftSeq IS NOT NULL — so a still-present member's
// redeem is a no-op. `role` is server-forced `member`; the host role is only ever minted at chat creation /
// handoff. `joinSeq`/`leftSeq` are stamped against messages.seq (the join/leave horizon), not the stream
// cursor.

import type { ParticipantKind } from "@orb/contracts/chat";
import { isUserBacked } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

type ParticipantActor =
  | { readonly kind: "human"; readonly userId: UserId }
  | { readonly kind: "character"; readonly characterId: CharacterId }
  // Agent rows are minted by chat.seatAgent — this arm is reachable.
  | { readonly kind: "agent"; readonly userId: UserId };

type ParticipantInsertRow = typeof chatParticipants.$inferInsert;

/** Validate + discriminate a `chat_participants` row's actor. `default` is `never`-exhaustive, so a new
 *  participant kind fails to compile until handled. Throws on a corrupt row (the db CHECK should make that
 *  unreachable). */
export function parseParticipant(row: {
  readonly kind: ParticipantKind;
  readonly userId: UserId | null;
  readonly characterId: CharacterId | null;
}): ParticipantActor {
  switch (row.kind) {
    case "human": {
      if (row.userId === null || row.characterId !== null) {
        throw new Error("corrupt participant: kind 'human' must carry userId XOR characterId");
      }
      return { kind: "human", userId: row.userId };
    }
    case "character": {
      if (row.characterId === null || row.userId !== null) {
        throw new Error("corrupt participant: kind 'character' must carry characterId XOR userId");
      }
      return { kind: "character", characterId: row.characterId };
    }
    default: {
      const _exhaustive: never = row.kind;
      throw new Error(`unknown participant kind: ${String(_exhaustive)}`);
    }
  }
}

/** A `character` participant is always `role='member'` — a character can never be the host. */
export function assertForcedCharacterMember(p: { readonly kind: ParticipantKind; readonly role: ParticipantRole }): void {
  if (p.kind === "character" && p.role !== "member") {
    throw new Error(`a character participant must be role 'member' (got '${p.role}')`);
  }
}

/** `leftSeq IS NULL` ⇒ present (in every union — WI/roster/arbitration). */
export function isPresent(p: { readonly leftSeq: number | null }): boolean {
  return p.leftSeq === null;
}

/** Present and not muted. A `disabled` participant still contributes cards/WI but is never
 *  arbiter-selected + is excluded from `{{groupNotMuted}}`. */
export function isArbiterEligible(p: { readonly leftSeq: number | null; readonly disabled: boolean }): boolean {
  return p.leftSeq === null && !p.disabled;
}

/** The PRINCIPAL kill-switch arm of the present-and-contributing predicate (D60; agent-principal-design/02
 *  §1.1, doc 03 §4): a USER-BACKED seat (`human`/`agent`) contributes only while its backing `users.enabled`
 *  is true — a disabled agent principal drops from every cast + arbitration pool the round after the flip
 *  (containment is a one-row flip, read fresh per round). A `character` seat has no backing user, so `enabled`
 *  never gates it (returns `true` regardless). Consumes {@link isUserBacked} so a 5th kind is caught upstream. */
export function isBackingUserEnabled(kind: ParticipantKind, enabled: boolean): boolean {
  return isUserBacked(kind) ? enabled : true;
}

/** Bulk-insert participant rows (the initial host+character roster, or a host adding a character). */
export async function insertParticipants(db: Db, rows: readonly ParticipantInsertRow[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db.insert(chatParticipants).values([...rows]);
}

/** The atomic human (re)join — the only human-membership write. Inserts a fresh `member` row, or on
 *  conflict re-joins a previously-left member. Returns `undefined` when the user is already present. */
export async function upsertMemberOnJoin(
  db: Db,
  params: {
    readonly participantId: ChatParticipantId;
    readonly chatId: ChatId;
    readonly userId: UserId;
    readonly joinSeq: number;
    readonly now: number;
    readonly activePersonaId?: PersonaId | null;
  },
): Promise<typeof chatParticipants.$inferSelect | undefined> {
  const rows = await db
    .insert(chatParticipants)
    .values({
      id: params.participantId,
      chatId: params.chatId,
      kind: "human",
      userId: params.userId,
      role: "member",
      activePersonaId: params.activePersonaId ?? null,
      joinedAt: params.now,
      joinSeq: params.joinSeq,
    })
    .onConflictDoUpdate({
      target: [chatParticipants.chatId, chatParticipants.userId],
      set: { joinSeq: params.joinSeq, leftSeq: null, role: "member" },
      setWhere: isNotNull(chatParticipants.leftSeq),
    })
    .returning();
  return rows.at(0);
}

/** Self-leave / kick-a-human: stamp `leftSeq` on the caller's present row (atomic). Returns the row left this
 *  call, or `undefined` if already gone / not a member. */
export async function markUserLeft(db: Db, chatId: ChatId, userId: UserId, leftSeq: number): Promise<typeof chatParticipants.$inferSelect | undefined> {
  const rows = await markUserLeftStatement(db, chatId, userId, leftSeq);
  return rows.at(0);
}

/** The {@link markUserLeft} UPDATE, unexecuted — `kick` hands it to the notifications emit op so the
 *  membership transition + the `kicked` INSERT commit in one batch. */
export function markUserLeftStatement(db: Db, chatId: ChatId, userId: UserId, leftSeq: number): AwaitableBatchStmt<(typeof chatParticipants.$inferSelect)[]> {
  return db
    .update(chatParticipants)
    .set({ leftSeq })
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .returning();
}

/** Kick any participant by id, unexecuted (works for a character too, which has no `userId`) — for callers
 *  that must commit the character-seat drop in one batch alongside another mutation. */
export function markParticipantLeftStatement(
  db: Db,
  participantId: ChatParticipantId,
  leftSeq: number,
): AwaitableBatchStmt<(typeof chatParticipants.$inferSelect)[]> {
  return db
    .update(chatParticipants)
    .set({ leftSeq })
    .where(and(eq(chatParticipants.id, participantId), isNull(chatParticipants.leftSeq)))
    .returning();
}

/** Set the pending host-handoff nominee, unexecuted — `nominateHostHandoff` hands it to the
 *  notifications emit op so the nomination + the `handoff-nominated` INSERT commit in one batch. A
 *  re-nominate overwrites the prior nominee. */
export function setPendingHostStatement(db: Db, chatId: ChatId, nomineeUserId: UserId, now: number): AwaitableBatchStmt<unknown> {
  return db.update(chats).set({ pendingHostUserId: nomineeUserId, updatedAt: now }).where(eq(chats.id, chatId));
}

/** The atomic host-handoff accept statements, unexecuted: demotes the present host → `member`, promotes
 *  the nominee → `host`, and clears the chat's pending nomination. Order is load-bearing: demote →
 *  promote → clear. The caller must verify the caller IS the pending nominee before calling.
 *
 *  `clearAnchorPersona` rides the SAME `chats` UPDATE as the nomination clear (one statement, not two): the
 *  D51 `{{user}}` anchor is resolved under the HOST's principal, so an anchor the incoming host cannot read is
 *  a dead pin — the POV falls through to the speaker's active persona while `ChatDetail` keeps serving an
 *  unreadable id (and `exportChat` still reads its NAME). The verb decides readability (stickler F2); this
 *  layer only writes the null it is told to. */
export function acceptHostHandoffSwapStatements(
  db: Db,
  params: { readonly chatId: ChatId; readonly nomineeUserId: UserId; readonly now: number; readonly clearAnchorPersona: boolean },
): BatchStmt[] {
  return [
    db
      .update(chatParticipants)
      .set({ role: "member" })
      .where(and(eq(chatParticipants.chatId, params.chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq))),
    db
      .update(chatParticipants)
      .set({ role: "host" })
      .where(and(eq(chatParticipants.chatId, params.chatId), eq(chatParticipants.userId, params.nomineeUserId), isNull(chatParticipants.leftSeq))),
    db
      .update(chats)
      .set({ pendingHostUserId: null, updatedAt: params.now, ...(params.clearAnchorPersona ? { anchorPersonaId: null } : {}) })
      .where(eq(chats.id, params.chatId)),
  ];
}
