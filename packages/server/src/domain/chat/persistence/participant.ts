// domain/chat/persistence/participant — the chat_participants kind-shape parser + the membership-lifecycle
// writes. Queries only: the shape-check/unique/atomic-upsert are db-level invariants this layer enforces;
// policy (who may join/kick/hand-off, targeting, AUTH_MODE gating) is the verbs'.
//
// The re-add upsert: a human (re)joins via a guarded atomic INSERT … ON CONFLICT(chatId,userId) DO UPDATE
// SET joinSeq=<head>, leftSeq=NULL, role='member' WHERE leftSeq IS NOT NULL — so a still-present member's
// redeem is a no-op. `role` is server-forced `member`; the host role is only ever minted at chat creation /
// handoff. `joinSeq`/`leftSeq` are stamped against messages.seq (the join/leave horizon), not the stream
// cursor.

import type { HandoffOffer, ParticipantKind } from "@orb/contracts/chat";
import { isUserBacked } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import { and, eq, isNotNull, isNull } from "drizzle-orm";

type ParticipantActor = { readonly kind: "human"; readonly userId: UserId } | { readonly kind: "character"; readonly characterId: CharacterId };

type ParticipantInsertRow = typeof chatParticipants.$inferInsert;

/** The row shape both {@link classifyParticipant} and {@link parseParticipant} discriminate. */
interface ParticipantRowShape {
  readonly kind: ParticipantKind;
  readonly userId: UserId | null;
  readonly characterId: CharacterId | null;
}

/** Discriminate a `chat_participants` row's actor — the pure, non-throwing classify (owner-ruled
 *  2026-08-15 one-home consolidation). `null` on an XOR violation (the DB CHECK should already guarantee
 *  `userId`/`characterId` are exclusive — a `null` here is the corrupt-row case) or an unrecognized kind.
 *  `default` is `never`-exhaustive against {@link ParticipantKind}'s today's two live kinds
 *  (`human`/`character`; `agent` was purged with the 2026-07-25 rollback and has no live row shape — see
 *  `contracts/chat/participants.ts`'s header), so a reintroduced kind fails to compile here until handled.
 *
 *  THE ONE HOME for the `kind === "human" && userId !== null`-shaped narrowing every roster-derived read
 *  needs — 29 call sites across the domain re-spelled this inline before the 2026-08-15 consolidation
 *  (`loadRoster`'s hot read never throws on a corrupt row; a `.filter`/`.flatMap`/`.find` site's silent-skip
 *  semantics are preserved by discarding a `null` classification exactly the way the inline guard already
 *  discarded a failed condition — zero behavior change was the whole point of splitting this off
 *  {@link parseParticipant}, which keeps the throwing contract for callers that want the loud belt). */
export function classifyParticipant(row: ParticipantRowShape): ParticipantActor | null {
  switch (row.kind) {
    case "human":
      return row.userId !== null && row.characterId === null ? { kind: "human", userId: row.userId } : null;
    case "character":
      return row.characterId !== null && row.userId === null ? { kind: "character", characterId: row.characterId } : null;
    default: {
      const _exhaustive: never = row.kind;
      return _exhaustive;
    }
  }
}

/** The loud belt for a corrupt row — throws on an XOR violation or unrecognized kind. Delegates to
 *  {@link classifyParticipant} (one home, one enforcement mechanism); kept for callers that want a hard
 *  failure rather than a silent skip (a future DB-integrity job, or a reader that never expects a corrupt
 *  row to reach it at all — see the header note above). Exercised directly by its own int suite (every
 *  XOR-violation arm). */
export function parseParticipant(row: ParticipantRowShape): ParticipantActor {
  const actor = classifyParticipant(row);
  if (actor === null) {
    throw new Error(`corrupt or unrecognized participant: kind '${row.kind}' must carry the XOR of userId/characterId for its kind`);
  }
  return actor;
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
 *  arbiter-selected + is excluded from `{{groupNotMuted}}`. Reuses {@link isPresent} — one home for
 *  the presence half of the rule (census #72 item 3: this used to re-spell `leftSeq === null` inline). */
export function isArbiterEligible(p: { readonly leftSeq: number | null; readonly disabled: boolean }): boolean {
  return isPresent(p) && !p.disabled;
}

/** The PRINCIPAL kill-switch arm of the present-and-contributing predicate. Wired for `human` (owner-ruled
 *  2026-08-15) at `verbs/turn.ts`'s `loadRoom`: a disabled human's backing `users.enabled` drops their
 *  persona from the room's foreign-input consent set (`presentHumanUserIds`) the round after the flip
 *  (containment is a one-row flip, read fresh per round via the injected `ctx.resolveUserEnabled`). Today's
 *  only USER_BACKED_KINDS member is `human` (`character` has no backing user, so `enabled` never gates it —
 *  returns `true` regardless); an `agent` kind, if it ever re-lands (D60; agent-principal-design/02 §1.1, doc
 *  03 §4), extends automatically — this predicate's mechanism was never kind-specific. Consumes
 *  {@link isUserBacked} so a 5th kind is caught upstream. */
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

/** Set the pending host-handoff nominee AND the property offer that qualifies them, unexecuted —
 *  `nominateHostHandoff` hands it to the notifications emit op so the nomination + the `handoff-nominated`
 *  INSERT commit in one batch. A re-nominate overwrites BOTH (the offer is a property OF this nomination, so
 *  it can never survive the nominee it was made to — re-nominating without an offer must not silently hand
 *  the new nominee the previous one's library). */
export function setPendingHostStatement(
  db: Db,
  params: { readonly chatId: ChatId; readonly nomineeUserId: UserId; readonly offer: HandoffOffer; readonly now: number },
): AwaitableBatchStmt<unknown> {
  return db
    .update(chats)
    .set({ pendingHostUserId: params.nomineeUserId, pendingHandoffOffer: params.offer, updatedAt: params.now })
    .where(eq(chats.id, params.chatId));
}

/** Re-point ONE present character seat at a different card, unexecuted — the handoff COPY's replacement for
 *  the D64 drop. IN PLACE, deliberately: the seat row keeps its `joinSeq` era, its `talkativeness`/`disabled`
 *  knobs and its identity, so the copied cast occupies exactly the history the originals did. Present-only
 *  (`leftSeq IS NULL`) — a seat that left mid-accept is not resurrected. */
export function repointCharacterSeatStatement(db: Db, participantId: ChatParticipantId, characterId: CharacterId): BatchStmt {
  return db
    .update(chatParticipants)
    .set({ characterId })
    .where(and(eq(chatParticipants.id, participantId), isNull(chatParticipants.leftSeq)));
}

/** The atomic host-handoff accept statements, unexecuted: demotes the present host → `member`, promotes
 *  the nominee → `host`, and clears the chat's pending nomination (nominee AND offer together — an executed
 *  offer must never be re-executable, and a cleared nominee with a live offer would be a consent with nobody
 *  attached to it). Order is load-bearing: demote → promote → clear. The caller must verify the caller IS
 *  the pending nominee before calling.
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
      .set({
        pendingHostUserId: null,
        pendingHandoffOffer: null,
        updatedAt: params.now,
        ...(params.clearAnchorPersona ? { anchorPersonaId: null } : {}),
      })
      .where(eq(chats.id, params.chatId)),
  ];
}
