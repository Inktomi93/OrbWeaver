// domain/chat/persistence/participant — the chat_participants kind-shape parser + the membership-lifecycle
// writes. Queries only: the shape-check/unique/atomic-upsert are db-level invariants this layer enforces;
// policy (who may join/kick/hand-off, targeting, AUTH_MODE gating) is the verbs'.
//
// The re-add upsert lives on the ONE human-membership write, `insertMemberAfterInviteClaimStatement`: a
// guarded atomic INSERT … ON CONFLICT(chatId,userId) DO UPDATE SET joinSeq=<head>, leftSeq=NULL,
// role='member' WHERE leftSeq IS NOT NULL — so a still-present member's redeem is a no-op. `role` is
// server-forced `member`; the host role is only ever minted at chat creation / handoff. `joinSeq`/`leftSeq`
// are stamped against messages.seq (the join/leave horizon), not the stream cursor, and `joinSeq` resolves
// IN-BATCH (#1403).
//
// THE SEAT ID IS STABLE ACROSS A RE-JOIN (#1542, owner-ruled 2026-09-05, arm A). The DO UPDATE `set` does
// NOT carry `id`: a human's membership is ONE row per (chatId,userId) that outlives every leave, so the PK
// child rows point at (`message_reactions.reactor_participant_id` today) never moves under them. The
// alternative — `ON UPDATE CASCADE` on that FK — was REJECTED: it would make the id churn survivable rather
// than removing it, and every future seat-keyed child would owe the same clause. The caller's freshly-minted
// `participantId` is therefore consumed by the INSERT arm only; a re-join discards it, and both invite doors
// re-read the roster afterwards rather than trusting the id they minted.

import type { HandoffOffer, ParticipantKind } from "@orb/contracts/chat";
import { isUserBacked } from "@orb/contracts/chat";
import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatInvites, chatParticipants, chats, messages } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, ChatInviteId, ChatParticipantId, PersonaId, UserId } from "@orb/kit/ids";
import type { AnyColumn, SQL } from "drizzle-orm";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";

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
 *  (`loadParticipants`'s hot read never throws on a corrupt row; a `.filter`/`.flatMap`/`.find` site's silent-skip
 *  semantics are preserved by discarding a `null` classification exactly the way the inline guard already
 *  discarded a failed condition — zero behavior change was the whole point of splitting this off
 *  {@link parseParticipant}, which keeps the throwing contract for callers that want the loud belt). */
export function classifyParticipant(row: ParticipantRowShape): ParticipantActor | null {
  switch (row.kind) {
    case "human":
      return row.userId !== null && row.characterId === null ? { kind: "human", userId: row.userId } : null;
    case "character":
      return row.characterId !== null && row.userId === null ? { kind: "character", characterId: row.characterId } : null;
    default:
      return classifyUnrecognizedKind(row.kind);
  }
}

/** The `default:` arm's fail-CLOSED verdict, and the reason it is a function rather than a `never` binding
 *  returned inline (#1480 item 1). The old spelling assigned `row.kind` to a `never`-typed local and
 *  RETURNED that local: compile-time exhaustive, but the raw runtime string at runtime. A row whose `kind`
 *  is neither live kind therefore classified as that STRING, which is not `null` — so
 *  {@link parseParticipant}'s `actor === null` rejection could never fire on it, and every
 *  `classifyParticipant(row)?.kind === "human"` reader saw a truthy actor carrying no `userId`. Reaching
 *  this arm needs a row that bypassed the
 *  `chat_participants_kind_check` DB CHECK (a hand-written row, a restored dump, a future kind added to the
 *  CHECK before this switch) -- exactly the corrupt-row case this classifier exists to absorb. The `never`
 *  parameter keeps the compile-time half intact: a reintroduced {@link ParticipantKind} member fails `tsc`
 *  HERE until it has its own `case`. (Shape precedent: `infra/providers/backends/agent-sdk/verify.ts`'s
 *  `assertNeverClassification` -- exhaustive at compile time, total and non-throwing at runtime.) */
function classifyUnrecognizedKind(_kind: never): null {
  return null;
}

/** The loud belt for a corrupt row — throws on an XOR violation or unrecognized kind. Delegates to
 *  {@link classifyParticipant} (one home, one enforcement mechanism); kept for callers that want a hard
 *  failure rather than a silent skip (a future DB-integrity job, or a reader that never expects a corrupt
 *  row to reach it at all — see the header note above). Exercised directly by its own int suite (every
 *  XOR-violation arm).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
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

/** `leftSeq IS NULL` ⇒ present (in every union — WI/roster/arbitration).
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
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
 *  2026-08-15) through `substrate/participants-humans.ts::presentAndEnabledHumanUserIdsOf` — the ONE async
 *  narrowing every consent-set consumer (`verbs/turn.ts`'s `loadRoom`, `setChatAnchorPersona`'s pin
 *  validation, `edit.ts`'s runOnEdit re-apply + greeting re-bake) routes through, so a disabled human's
 *  backing `users.enabled` drops their persona from EVERY reader of the room's foreign-input consent set the
 *  round after the flip, not just the one a lone-symbol wiring pass happened to touch (containment is a
 *  one-row flip, read fresh per round via the injected `ctx.resolveUserEnabled`). Today's only
 *  USER_BACKED_KINDS member is `human` (`character` has no backing user, so `enabled` never gates it —
 *  returns `true` regardless); an `agent` kind, if it ever re-lands (D60; agent-principal-design/02 §1.1, doc
 *  03 §4), extends automatically — this predicate's mechanism was never kind-specific. Consumes
 *  {@link isUserBacked} so a 5th kind is caught upstream. */
export function isBackingUserEnabled(kind: ParticipantKind, enabled: boolean): boolean {
  return isUserBacked(kind) ? enabled : true;
}

/** Bulk-insert participant rows (the initial host+character roster, or a host adding a character). */
export async function insertParticipants(db: Db, rows: readonly ParticipantInsertRow[], coStatements: readonly BatchStmt[] = []): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  await db.batch(batchMany([db.insert(chatParticipants).values([...rows]), ...coStatements]));
}

/** The canon head the seat is stamped against, as SQL — evaluated INSIDE the claim batch (#1403).
 *
 *  `joinSeq` is a HISTORY FLOOR: `substrate/auth::isBelowHistoryFloor` withholds every message at or below it
 *  from the joining member. Reading the head with a standalone `loadMaxMessageSeq` and baking the NUMBER into
 *  these params left a window — a message committed between that read and the batch got a seq ABOVE the stored
 *  floor although it was committed BEFORE the member was seated, so history-floor readers exposed a pre-join
 *  message to the new member. The claim UPDATE is the batch's first statement and is a WRITE, so the batch
 *  already holds SQLite's write lock by the time this subquery runs: no concurrent message can land between
 *  the head read and the seat insert. (Not a SELECT statement AHEAD of the writes -- `@orb/db/kit::batchMany`'s
 *  DEFERRED-snapshot rule bans that shape; this is a scalar subquery inside a write.)
 *
 *  THE OUTER REFERENCE IS QUALIFIED BY HAND, AND THAT IS THE WHOLE CORRELATION (#2244). Drizzle renders every
 *  column inside an `INSERT … SELECT` projection WITHOUT its table qualifier, so passing `chatId` as a plain
 *  column emitted `where "chat_id" = "chat_id"` — a tautology SQLite resolves entirely against the subquery's
 *  own `messages` scope. The floor a first-join seat recorded was therefore the table-wide `max(messages.seq)`,
 *  every OTHER room's canon head included: a `from-join` member seated in a quiet room read their whole
 *  transcript back EMPTY (the e2e D16 symptom), and a single-chat fixture cannot tell the two answers apart.
 *  Re-spelling the outer side as `<table>.<column>` survives that de-qualification; the INNER references stay
 *  plain, because unqualified there they still resolve against this subquery's own FROM. */
function canonHeadSeq(chatId: AnyColumn): SQL<number> {
  const outerChatId = sql`${chatId.table}.${sql.identifier(chatId.name)}`;
  return sql<number>`(select coalesce(max(${messages.seq}), 0) from ${messages} where ${messages.chatId} = ${outerChatId})`;
}

/** Invite-only conditional seat statement. It runs immediately after the conditional invite UPDATE in one
 * `db.batch`: SQLite `changes()` is 1 only when that exact preceding claim incremented a row, so a zero-row
 * claim makes this INSERT zero-row too. A seat constraint failure aborts the batch and rolls the increment
 * back. This is intentionally one connection-local primitive, not a pre-read inference. The join floor is
 * resolved in-batch too -- see {@link canonHeadSeq}. */
export function insertMemberAfterInviteClaimStatement(
  db: Db,
  params: {
    readonly participantId: ChatParticipantId;
    readonly inviteId: ChatInviteId;
    readonly userId: UserId;
    readonly now: number;
    readonly activePersonaId: PersonaId | null;
  },
): AwaitableBatchStmt<(typeof chatParticipants.$inferSelect)[]> {
  return db
    .insert(chatParticipants)
    .select(
      db
        .select({
          id: sql<ChatParticipantId>`${params.participantId}`.as("id"),
          chatId: chatInvites.chatId,
          kind: sql<"human">`'human'`.as("kind"),
          userId: sql<UserId>`${params.userId}`.as("user_id"),
          characterId: sql<null>`null`.as("character_id"),
          role: sql<"member">`'member'`.as("role"),
          activePersonaId: sql<PersonaId | null>`${params.activePersonaId}`.as("active_persona_id"),
          talkativeness: sql<number>`0.5`.as("talkativeness"),
          disabled: sql<boolean>`false`.as("disabled"),
          joinedAt: sql<number>`${params.now}`.as("joined_at"),
          joinSeq: canonHeadSeq(chatInvites.chatId).as("join_seq"),
          leftSeq: sql<null>`null`.as("left_seq"),
          joinHistoryVisibility: sql<"full">`'full'`.as("join_history_visibility"),
        })
        .from(chatInvites)
        .where(and(eq(chatInvites.id, params.inviteId), sql`changes() > 0`)),
    )
    .onConflictDoUpdate({
      target: [chatParticipants.chatId, chatParticipants.userId],
      set: {
        // NO `id` HERE (#1542). The seat KEEPS ITS IDENTITY across a re-join: `params.participantId` is a
        // freshly-minted id the INSERT arm consumes, and re-stamping it on the UPDATE arm moved a PK that
        // `message_reactions.reactor_participant_id` FKs under SQLite's default NO ACTION on update — so the
        // whole redeem batch failed ("cannot re-join") for any returning member who had ever reacted. Keeping
        // the id is also what the deleted `upsertMemberOnJoin` did, and it is the semantics every seat-keyed
        // child row already assumes: a membership is ONE row per (chatId,userId) across all its eras.
        activePersonaId: params.activePersonaId,
        joinedAt: params.now,
        // The re-add arm stamps the SAME in-batch head (`chatParticipants.chatId` is the conflicting row's
        // own chat -- the one the invite named), so a rejoin's floor is as race-free as a first join's.
        joinSeq: canonHeadSeq(chatParticipants.chatId),
        leftSeq: null,
        role: "member",
      },
      setWhere: isNotNull(chatParticipants.leftSeq),
    })
    .returning();
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
 *  knobs and its identity, so the copied seated character occupies exactly the history the original did. Present-only
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

/** The `$.copyCast` → `$.copyCharacters` key rewrite over every `chats.pending_handoff_offer` blob written
 *  before the #1649 vocabulary rename (owner-ruled 2026-09-05 arm (a): rename the wire field WITH a data
 *  migration, no read-compat shim). Returns the number of rows rewritten.
 *
 *  WHY A DATA MIGRATION AND NOT A SHIM: the offer's read seam is
 *  `handoffOfferSchema.catch(NO_HANDOFF_OFFER).parse(...)` (`persistence/queries.ts#loadPendingHandoff`), so an
 *  un-migrated blob does not fail loudly — it degrades to the no-offer offer and the departing host's
 *  recorded consent to hand over their characters is silently dropped at accept. The column is plain TEXT
 *  (`pending_handoff_offer`), so this is a DATA rewrite with NO DDL: it does not touch `0000_baseline.sql`
 *  and cannot be squashed into it (Tier-1-DB §"Regime 1" covers schema, and a baseline reset would not reach
 *  an installed db anyway).
 *
 *  ONE statement, evaluated against the row under its own write lock — the `chat-metadata-write` json-path
 *  posture, never a read-merge-write:
 *   • IDEMPOTENT — the WHERE fires only on a blob that still carries `$.copyCast`, and the SET removes it, so
 *     the second and every later boot match zero rows.
 *   • VALUE-PRESERVING for the untouched half — `copyGmPreset` is never named by the statement, so its stored
 *     value survives verbatim (SQLite's json functions re-serialize the object, so KEY ORDER is not preserved;
 *     the blob is parsed by zod at every read seam and never compared as bytes).
 *   • TOTAL — every row carrying the key is rewritten, including a corrupt one. `json_extract` of a JSON
 *     boolean yields the INTEGER 0/1, which `z.boolean()` would reject, so the new value is re-minted as real
 *     JSON `true`/`false` through `json(...)` (the `theme-queries` `json('null')` precedent). A non-boolean
 *     `copyCast` therefore lands as `false` — exactly what the `.catch` seam already resolved it to.
 *   • FAIL-OPEN ON GARBAGE — a blob that is not JSON at all is left alone for the read seam's `.catch`; see
 *     the `json_valid` note on the predicate for why that guard is nested rather than a sibling AND term. */
export async function migrateHandoffOfferVocab(db: Db): Promise<number> {
  const rows = await db
    .update(chats)
    .set({
      pendingHandoffOffer: sql`json_remove(json_set(${chats.pendingHandoffOffer}, '$.copyCharacters', json(CASE WHEN json_extract(${chats.pendingHandoffOffer}, '$.copyCast') THEN 'true' ELSE 'false' END)), '$.copyCast')`,
    })
    .where(
      and(
        isNotNull(chats.pendingHandoffOffer),
        // The `json_valid` guard is INSIDE `json_type`'s first argument, not a sibling AND term: SQLite may
        // reorder AND operands, and `json_type` on a non-JSON string RAISES — which at this call site would
        // abort boot on one corrupt row. A blob that is not JSON resolves to `'{}'`, matches nothing, and is
        // left for the read seam's `.catch`.
        sql`json_type(CASE WHEN json_valid(${chats.pendingHandoffOffer}) THEN ${chats.pendingHandoffOffer} ELSE '{}' END, '$.copyCast') is not null`,
      ),
    )
    .returning({ id: chats.id });
  return rows.length;
}
