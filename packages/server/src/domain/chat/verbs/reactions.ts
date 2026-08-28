// domain/chat/verbs/reactions — B6/MR0-MR1, the message-reaction plane: `toggleReaction` + `listReactions`.
//
// CLASS-2-CONCURRENT (interaction-direction-spec §1). A reaction CONTRIBUTES to canon and is ALWAYS
// attributed — but it takes no turn slot, no arbitration, and no chat lock. That is not a shortcut; it is
// what the shape buys: the `(variantId, seat, emoji)` UNIQUE makes each toggle one atomic statement, so the
// concurrency the lock exists to serialize cannot occur (`persistence/reactions.ts` header).
//
// THE MEMBERSHIP FLOOR, not the host gate. Reactions are the room talking back, and every SEATED member
// speaks — `requireParticipant`, the `setVariables`/vars-plane posture, never `requireHost`. Two consequences
// the code below spells: a non-member's chatId collapses to a leak-free `ChatNotFoundError` before anything
// loads, and a MEMBER aiming a foreign variant id at their own room hits the variant's own belt
// (`loadVariantSlotInChat` — the `getVariantWire` two-gate shape).
//
// DURABLE-FIRST. The bus emit happens strictly AFTER the write commits, and ONLY when the write actually
// changed something (both persistence statements answer with `RETURNING`): a repeat add and a repeat remove
// are no-ops, and announcing one would repaint every other member's transcript for nothing — and would fire
// every `reactionsChanged` automation rule in the room off a click that changed no state.
//
// THE DIRECTION IS THE SERVER'S DECISION. The client sends "toggle this emoji", not "add"/"remove": a tab a
// repaint behind would otherwise re-add a reaction the reader just removed. The verb reads what the seat
// holds (the same keyed DELETE that removes it answers whether it was there) and returns the RESULTING state
// so the clicking tab can settle without waiting for its own bus round-trip.

import type { DurableChatBusEvent, MessageReactionGroup, ReactionEmoji } from "@orb/contracts/chat";
import { CHAT_REACTION_SLOT_WINDOW, reactionEmojiSchema } from "@orb/contracts/chat";
import type { ChatParticipantId, MessageVariantId } from "@orb/kit/ids";
import type { ChatContext } from "../context.ts";
import { ChatNotFoundError } from "../contract/errors.ts";
import type { ListReactionsParams, ToggleReactionParams } from "../contract/params.ts";
import type { ChatService } from "../contract/service.ts";
import { requireParticipant } from "../guard.ts";
import { deleteReaction, insertReaction, listChatReactions, loadReactorSeatId, loadVariantSlotInChat } from "../persistence/reactions.ts";

/** One row of the window read, taken off the query's OWN return type — the shape is that query's, and
 *  `no-inline-types` keeps a persistence file from exporting it as if it were a contract. */
type ReactionRow = Awaited<ReturnType<typeof listChatReactions>>[number];

/** The reaction verbs' collaborators not on `ChatContext`. The emit is typed to `DurableChatBusEvent` (the
 *  narrowing every durable emit surface takes) — `reactionsChanged` is canon and replays, so appending it is
 *  correct and a live-only member here would be a compile error. */
interface ReactionsDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
}

/** Group the flat rows into the chip projection — `GROUP BY (variantId, emoji)`, order preserved from the
 *  query (oldest reaction first within a chip, chips in first-reacted order per variant). A `Map` keyed on
 *  the pair rather than a nested object: the key is composite and a nested record would need two lookups and
 *  a prototype guard for an emoji that happens to spell `__proto__`. The parts are joined on an ESCAPED
 *  NUL (`\u0000`, never a raw byte — `no-nul-bytes-in-source`): it is the one separator no id and no
 *  emoji can contain, so `a|bc` can never collide with `ab|c`. */
function groupReactions(rows: readonly ReactionRow[]): readonly MessageReactionGroup[] {
  const byPair = new Map<
    string,
    { variantId: MessageVariantId; emoji: ReactionEmoji; emojiImageAssetId: ReactionRow["emojiImageAssetId"]; reactors: ChatParticipantId[] }
  >();
  for (const row of rows) {
    // THE READ SEAM (the `parseChatMetadata` posture, never a cast): the column is plain TEXT — the
    // vocabulary is open by design — so the token is PARSED back into the wire union here. A row that
    // fails is DROPPED rather than thrown on: a projection degrades (`contentSpansToBlocks` doctrine),
    // and the only way to produce one today is a hand-written row, which must not break a room's pills.
    const token = reactionEmojiSchema.safeParse(row.emoji);
    if (!token.success) {
      continue;
    }
    const key = `${row.variantId}\u0000${row.emoji}`;
    const existing = byPair.get(key);
    if (existing === undefined) {
      byPair.set(key, { variantId: row.variantId, emoji: token.data, emojiImageAssetId: row.emojiImageAssetId, reactors: [row.reactorParticipantId] });
      continue;
    }
    existing.reactors.push(row.reactorParticipantId);
  }
  return [...byPair.values()].map((g) => ({
    variantId: g.variantId,
    emoji: g.emoji,
    emojiImageAssetId: g.emojiImageAssetId,
    reactorParticipantIds: g.reactors,
  }));
}

/** The reaction slice of `ChatService` (both verbs share the gate + the seat resolution, so one factory). */
export function createReactions(ctx: ChatContext, deps: ReactionsDeps): Pick<ChatService, "toggleReaction" | "listReactions"> {
  async function toggleReaction({ principal, chatId, emoji, variantId }: ToggleReactionParams): Promise<boolean> {
    const membership = await requireParticipant(ctx, principal, chatId);
    // Defense in depth over the transport parse (the `setUserMacroValues` precedent): the vocabulary is
    // wire-validated, and this is the boundary a non-tRPC caller would enter through.
    const token = reactionEmojiSchema.parse(emoji);
    // The caller is a present member (the guard proved it), so the seat exists — EXCEPT for a principal
    // whose membership is a CHARACTER seat, which cannot happen (a character has no userId to authenticate
    // as). A miss is therefore the racing-leave case, and it collapses to the same leak-free NOT_FOUND the
    // guard would have thrown a moment earlier.
    const seatId = await loadReactorSeatId(ctx.db, chatId, principal.userId);
    if (seatId === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    // The variant's OWN belt: in THIS chat, and at or above the caller's D16 read floor. One `undefined` for
    // absent / other-room / below-floor, so a member learns nothing about a variant they may not read.
    const slot = await loadVariantSlotInChat(ctx.db, chatId, variantId, membership.historyFloorSeq);
    if (slot === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    // REMOVE-FIRST is what makes this a toggle without a read: the keyed DELETE both removes the reaction and
    // ANSWERS whether the seat held it. A separate "does it exist?" SELECT would be a TOCTOU window between
    // two of the reader's own devices.
    const removed = await deleteReaction(ctx.db, { variantId, reactorParticipantId: seatId, emoji: token });
    const added = removed
      ? false
      : await insertReaction(ctx.db, { id: ctx.newMessageReactionId(), variantId, reactorParticipantId: seatId, emoji: token, createdAt: ctx.now() });
    if (removed || added) {
      await deps.emit({ type: "reactionsChanged", chatId, messageId: slot.messageId, variantId, emoji: token, added });
    }
    return added;
  }

  async function listReactions({ principal, chatId }: ListReactionsParams): Promise<readonly MessageReactionGroup[]> {
    const membership = await requireParticipant(ctx, principal, chatId);
    const rows = await listChatReactions(ctx.db, chatId, { slotWindow: CHAT_REACTION_SLOT_WINDOW, floorSeq: membership.historyFloorSeq });
    return groupReactions(rows);
  }

  return { toggleReaction, listReactions };
}
