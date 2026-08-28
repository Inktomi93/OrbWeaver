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

import type { Db } from "@orb/db";
import { chatParticipants, messageReactions, messages, messageVariants } from "@orb/db";
import type { AssetId, ChatId, ChatParticipantId, MessageId, MessageReactionId, MessageVariantId, UserId } from "@orb/kit/ids";
import { and, desc, eq, gte, inArray, isNull, max } from "drizzle-orm";

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
 *  cannot distinguish them. */
export async function loadVariantSlotInChat(
  db: Db,
  chatId: ChatId,
  variantId: MessageVariantId,
  floorSeq: number,
): Promise<{ readonly messageId: MessageId } | undefined> {
  const rows = await db
    .select({ messageId: messages.id })
    .from(messageVariants)
    .innerJoin(messages, eq(messages.id, messageVariants.messageId))
    .where(and(eq(messageVariants.id, variantId), eq(messages.chatId, chatId), gte(messages.seq, floorSeq)))
    .limit(LIMIT_ONE);
  return rows.at(0);
}

/** Add one reaction. Returns TRUE only when a row was actually inserted — a repeat of a reaction the seat
 *  already holds conflicts away to nothing, and the verb must not announce a change that did not happen. */
export async function insertReaction(
  db: Db,
  values: {
    readonly id: MessageReactionId;
    readonly variantId: MessageVariantId;
    readonly reactorParticipantId: ChatParticipantId;
    readonly emoji: string;
    readonly createdAt: number;
  },
): Promise<boolean> {
  const rows = await db.insert(messageReactions).values(values).onConflictDoNothing().returning({ id: messageReactions.id });
  return rows.length > 0;
}

/** Remove one reaction, keyed by the UNIQUE. Returns TRUE only when a row was actually deleted. */
export async function deleteReaction(
  db: Db,
  key: { readonly variantId: MessageVariantId; readonly reactorParticipantId: ChatParticipantId; readonly emoji: string },
): Promise<boolean> {
  const rows = await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.variantId, key.variantId),
        eq(messageReactions.reactorParticipantId, key.reactorParticipantId),
        eq(messageReactions.emoji, key.emoji),
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
      })
      .from(messageReactions)
      .innerJoin(messageVariants, eq(messageVariants.id, messageReactions.variantId))
      .where(inArray(messageVariants.messageId, recentSlots))
      // Deterministic group order: oldest reaction first WITHIN a chip, so the pill row's reactor list is
      // "who reacted, in the order they did" rather than whatever the planner returns.
      .orderBy(messageReactions.createdAt, messageReactions.id)
  );
}
