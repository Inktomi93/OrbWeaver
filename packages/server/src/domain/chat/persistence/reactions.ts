// domain/chat/persistence/reactions — the B6/MR0 reaction plane's four statements: resolve the caller's
// SEAT, prove a variant belongs to the room, toggle one row, and read the room's bounded grouped window.
//
// THE TOGGLE IS ONE STATEMENT IN EITHER DIRECTION, and that is the whole concurrency story (MA-2 §5). Add is
// `INSERT … ON CONFLICT DO NOTHING RETURNING`, remove is a keyed `DELETE … RETURNING`; the
// `(variantId, reactorParticipantId, emoji)` UNIQUE makes a double-add a no-op rather than a duplicate, so
// two members racing on the same message cannot corrupt the set and no turn lock is involved. `RETURNING` is
// what makes the verb's emit HONEST: a no-op add and a no-op remove both come back empty, so nothing is
// announced on the bus that did not actually change.
//
// THE READ IS A WINDOW, NOT THE WHOLE HISTORY, and it counts SLOTS rather than ROWS (the
// `rpg/persistence/turn-tool-calls` shape, and for the same measured reason): rows are per-VARIANT, so a
// reroll-heavy slot would otherwise spend the budget on swipes nobody can look at while an older SELECTED
// variant still on screen went dark. Every reaction of a windowed slot ships — including its dead swipes' —
// because the client indexes by `variantId` and that index is exactly what makes a swipe cost no refetch.
//
// THE D16 FLOOR IS APPLIED HERE, not left to the caller. A `from-join` member may not read canon below their
// own `joinSeq`, and a reaction is a fact ABOUT a canon row — a pill row naming who laughed at a message the
// reader is not allowed to see is the same leak one seq lower. The floor arrives on the guard's resolved
// membership (`requireParticipant` → `historyFloorSeq`), so the verb passes it and cannot forget it.

import type { MessageKind } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characters, chatParticipants, messageReactions, messages, messageVariants, personas } from "@orb/db";
import type { AssetId, ChatId, ChatParticipantId, MessageId, MessageReactionId, MessageVariantId, UserId } from "@orb/kit/ids";
import { and, desc, eq, gte, inArray, isNull, max } from "drizzle-orm";
import type { StoredSegmentAnchor } from "../contract/params.ts";

const LIMIT_ONE = 1;

/** One persisted reaction row, joined to the slot it hangs off (the slot id is what the bus event and the
 *  trigger fact carry — a client indexes by variant, an automation predicate reads the message).
 *
 *  FILE-LOCAL by design (the `guard.ts::MemberChat` precedent): it is the inferred shape of ONE query, not
 *  a cross-boundary contract, and `no-inline-types` homes an EXPORTED shape in `contract/`. The verb reads
 *  it back off the function's own return type instead. */
interface ReactionRow {
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly reactorParticipantId: ChatParticipantId;
  readonly emoji: string;
  readonly emojiImageAssetId: AssetId | null;
  readonly segmentIndex: number | null;
  readonly segmentSpeaker: string | null;
  readonly segmentSnippet: string | null;
}

/** The caller's PRESENT seat in this room (D80) — the reactor id every write stamps.
 *
 *  A separate read from the guard's `loadMemberChat` on purpose: that query is on the hot path of every
 *  chatId verb in the domain and returns the chat row plus the caller's role, not the participant PK.
 *  Widening it to carry an id only this plane wants would put a column on ~40 call sites' return shape. */
export async function loadReactorSeatId(db: Db, chatId: ChatId, userId: UserId): Promise<ChatParticipantId | undefined> {
  const rows = await db
    .select({ id: chatParticipants.id })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.userId, userId), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  return rows.at(0)?.id;
}

/** The slot a variant belongs to, IF that variant is in this chat AND at or above the reader's floor.
 *
 *  This is the `variantId` half's own belt (the `getVariantWire` precedent): the chatId gate refuses a
 *  stranger, and this refuses a MEMBER who aims a foreign — or below-floor — variant id at their own room.
 *  `undefined` is the one answer for all three misses (absent / other room / below floor), so a caller
 *  cannot distinguish them. `content` rides along for the B7 segment write: the verb re-parses the CANON
 *  bytes itself to validate a claimed anchor, and a second point read for them would be the same query. */
export async function loadVariantSlotInChat(
  db: Db,
  chatId: ChatId,
  variantId: MessageVariantId,
  floorSeq: number,
): Promise<{ readonly messageId: MessageId; readonly kind: MessageKind; readonly content: string } | undefined> {
  const rows = await db
    .select({ messageId: messages.id, kind: messages.kind, content: messageVariants.content })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messageVariants.id, variantId), eq(messages.chatId, chatId), gte(messages.seq, floorSeq)))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** The room's PRESENT CHARACTER-NAME set — every present character seat's character name, the plain-`Name:`
 *  span grammar's key set. The SERVER-SIDE MIRROR of the client's `speakerThemesByName` keys
 *  (`features/chat/lib/attribution.ts` — character seats only): the two must key the same names or a
 *  picker-computed segment index and this side's validation parse would disagree about the same bytes. */
export async function loadPresentCharacterNames(db: Db, chatId: ChatId): Promise<readonly string[]> {
  const rows = await db
    .select({ name: characters.name })
    .from(chatParticipants)
    .innerJoin(characters, eq(characters.id, chatParticipants.characterId))
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)));
  return rows.map((r) => r.name);
}

/** The room's PRESENT HOST's userId, or `undefined` for a hostless/stale room. Served by the partial
 *  `chat_participants_chat_host_unique` index (one present host as physics — #390), so this is a point
 *  read. The B7 verb-time gates resolve the host's per-user reaction defaults under THIS identity — the
 *  host governs the room's posture (the `resolveOfferChoices` precedence), never the caller. */
export async function loadPresentHostUserId(db: Db, chatId: ChatId): Promise<UserId | undefined> {
  const rows = await db
    .select({ userId: chatParticipants.userId })
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)))
    .limit(LIMIT_ONE);
  const userId = rows.at(0)?.userId;
  return userId ?? undefined;
}

/** A PRESENT character seat by its character's EXACT (trimmed) name — the `react` tool's actor resolution
 *  (the model speaks names, never ids). `undefined` for an absent/departed/non-character match; the tool
 *  narrates that as errors-as-data.
 *
 *  `disabled` RIDES ALONG rather than being a WHERE predicate (#1402), because the two misses are different
 *  answers to a MODEL: "there is nobody by that name here" routes it to another cast member, "that one is
 *  muted" tells it the seat exists and is switched off. The verb owns the refusal words; the seat's mute is
 *  the same kill-switch `participant::isArbiterEligible` applies to speaking. */
export async function loadCharacterSeatByName(
  db: Db,
  chatId: ChatId,
  name: string,
): Promise<{ readonly participantId: ChatParticipantId; readonly characterName: string; readonly disabled: boolean } | undefined> {
  const rows = await db
    .select({ participantId: chatParticipants.id, characterName: characters.name, disabled: chatParticipants.disabled })
    .from(chatParticipants)
    .innerJoin(characters, eq(characters.id, chatParticipants.characterId))
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq), eq(characters.name, name.trim())))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** The room's NEWEST committed slot AT OR ABOVE `floorSeq`, with its SELECTED variant — the `react` tool's one
 *  target (the model reacts to what just happened; it cannot name a message id and is not taught one).
 *  `undefined` for an empty room, a slot whose selection pointer is unset/dangling, and — the same answer, on
 *  purpose — a room whose whole visible window is below the CALLER's D16 floor (#1402).
 *
 *  The floor is a required parameter for the reason the file header gives about the toggle's belt: a reaction
 *  is a fact ABOUT a canon row, so the read that picks the row obeys the caller's own floor rather than
 *  trusting the verb to remember. Today's caller is the turn's resolved HOST (floor 0, so this is identity for
 *  it), but the op's contract admits any member principal and its guard is `requireParticipant`. */
export async function loadNewestSelectedSlot(
  db: Db,
  chatId: ChatId,
  floorSeq: number,
): Promise<{ readonly messageId: MessageId; readonly variantId: MessageVariantId; readonly kind: MessageKind; readonly content: string } | undefined> {
  const rows = await db
    .select({ messageId: messages.id, variantId: messageVariants.id, kind: messages.kind, content: messageVariants.content })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(and(eq(messages.chatId, chatId), gte(messages.seq, floorSeq)))
    .orderBy(desc(messages.seq))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** Add one reaction. Returns TRUE only when a row was actually inserted — a repeat of a reaction the seat
 *  already holds conflicts away to nothing, and the verb must not announce a change that did not happen.
 *  `segment` null = whole-message (the partial-unique's first arm dedupes it; the second dedupes an
 *  anchored one). */
export async function insertReaction(
  db: Db,
  values: {
    readonly id: MessageReactionId;
    readonly variantId: MessageVariantId;
    readonly reactorParticipantId: ChatParticipantId;
    readonly emoji: string;
    readonly segment: StoredSegmentAnchor | null;
    readonly createdAt: number;
  },
): Promise<boolean> {
  const { segment, ...base } = values;
  const rows = await db
    .insert(messageReactions)
    .values({ ...base, ...(segment ?? { segmentIndex: null, segmentSpeaker: null, segmentSnippet: null }) })
    .onConflictDoNothing()
    .returning({ id: messageReactions.id });
  return rows.length > 0;
}

/** Remove one reaction, keyed by its owning PARTIAL unique (whole-message vs segment-anchored — the two
 *  are independent toggles, MA-2 §4). Returns TRUE only when a row was actually deleted. */
export async function deleteReaction(
  db: Db,
  key: { readonly variantId: MessageVariantId; readonly reactorParticipantId: ChatParticipantId; readonly emoji: string; readonly segmentIndex: number | null },
): Promise<boolean> {
  const rows = await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.variantId, key.variantId),
        eq(messageReactions.reactorParticipantId, key.reactorParticipantId),
        eq(messageReactions.emoji, key.emoji),
        key.segmentIndex === null ? isNull(messageReactions.segmentIndex) : eq(messageReactions.segmentIndex, key.segmentIndex),
      ),
    )
    .returning({ id: messageReactions.id });
  return rows.length > 0;
}

/** The room's bounded reaction window, newest slot first (see the header for why the budget counts SLOTS).
 *  Rows, not groups: the grouping is a pure projection the verb applies, so this stays one indexed read. */
export function listChatReactions(db: Db, chatId: ChatId, opts: { readonly slotWindow: number; readonly floorSeq: number }): Promise<readonly ReactionRow[]> {
  const recentSlots = db
    .select({ messageId: messageVariants.messageId })
    .from(messageReactions)
    .innerJoin(messageVariants, eq(messageVariants.id, messageReactions.variantId))
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messages.chatId, chatId), gte(messages.seq, opts.floorSeq)))
    .groupBy(messageVariants.messageId)
    // A slot's recency is its NEWEST reaction's — a fresh reaction makes an old message recent again, which
    // is what a reader means by "the last N reacted messages". `id` breaks a same-millisecond tie.
    .orderBy(desc(max(messageReactions.createdAt)), desc(max(messageReactions.id)))
    .limit(opts.slotWindow);
  return (
    db
      .select({
        messageId: messageVariants.messageId,
        variantId: messageReactions.variantId,
        reactorParticipantId: messageReactions.reactorParticipantId,
        emoji: messageReactions.emoji,
        emojiImageAssetId: messageReactions.emojiImageAssetId,
        segmentIndex: messageReactions.segmentIndex,
        segmentSpeaker: messageReactions.segmentSpeaker,
        segmentSnippet: messageReactions.segmentSnippet,
      })
      .from(messageReactions)
      .innerJoin(messageVariants, eq(messageVariants.id, messageReactions.variantId))
      .where(inArray(messageVariants.messageId, recentSlots))
      // Deterministic group order: oldest reaction first WITHIN a chip, so the pill row's reactor list is
      // "who reacted, in the order they did" rather than whatever the planner returns.
      .orderBy(messageReactions.createdAt, messageReactions.id)
  );
}

/** The MR4 attribution read: every reaction on the newest `slotWindow` reacted slots' SELECTED variants,
 *  above the HOST's floor, with the variant's canon bytes and the reactor's DISPLAY identity flattened on.
 *
 *  SELECTED-ONLY, unlike {@link listChatReactions}: the prompt contains selected variants, so a reaction
 *  parked on a dead swipe must not be narrated into a turn that never shows that text. The reactor's name
 *  resolves here rather than in the contribution because it is ONE LEFT-JOIN pair on a read this bounded —
 *  a character seat carries its character's name, a human seat its active persona's (the in-fiction
 *  identity; the "User" floor is the caller's, matching the engine's `userSpeakerName` posture). */
export function listAttributionReactions(
  db: Db,
  chatId: ChatId,
  opts: { readonly slotWindow: number; readonly floorSeq: number },
): Promise<
  readonly {
    readonly messageId: MessageId;
    readonly messageSeq: number;
    readonly messageKind: MessageKind;
    readonly variantId: MessageVariantId;
    readonly content: string;
    readonly emoji: string;
    readonly segmentIndex: number | null;
    readonly segmentSpeaker: string | null;
    readonly segmentSnippet: string | null;
    readonly createdAt: number;
    readonly reactorCharacterName: string | null;
    readonly reactorPersonaName: string | null;
    readonly createdAtId: MessageReactionId;
  }[]
> {
  const recentSlots = db
    .select({ messageId: messages.id })
    .from(messageReactions)
    .innerJoin(messageVariants, eq(messageVariants.id, messageReactions.variantId))
    .innerJoin(messages, and(eq(messages.id, messageVariants.messageId), eq(messages.selectedVariantId, messageVariants.id)))
    .where(and(eq(messages.chatId, chatId), gte(messages.seq, opts.floorSeq)))
    .groupBy(messages.id)
    .orderBy(desc(max(messageReactions.createdAt)), desc(max(messageReactions.id)))
    .limit(opts.slotWindow);
  return (
    db
      .select({
        messageId: messages.id,
        messageSeq: messages.seq,
        messageKind: messages.kind,
        variantId: messageReactions.variantId,
        content: messageVariants.content,
        emoji: messageReactions.emoji,
        segmentIndex: messageReactions.segmentIndex,
        segmentSpeaker: messageReactions.segmentSpeaker,
        segmentSnippet: messageReactions.segmentSnippet,
        createdAt: messageReactions.createdAt,
        reactorCharacterName: characters.name,
        reactorPersonaName: personas.name,
        createdAtId: messageReactions.id,
      })
      .from(messageReactions)
      .innerJoin(messageVariants, eq(messageVariants.id, messageReactions.variantId))
      .innerJoin(messages, and(eq(messages.id, messageVariants.messageId), eq(messages.selectedVariantId, messageVariants.id)))
      .innerJoin(chatParticipants, eq(chatParticipants.id, messageReactions.reactorParticipantId))
      .leftJoin(characters, eq(characters.id, chatParticipants.characterId))
      .leftJoin(personas, eq(personas.id, chatParticipants.activePersonaId))
      .where(inArray(messages.id, recentSlots))
      // Chronological by slot, then by reaction age — the contribution walks this in narration order and
      // applies the per-message K cap on the NEWEST rows (it slices from the tail per message).
      .orderBy(messages.seq, messageReactions.createdAt, messageReactions.id)
  );
}
