// persistence: the reaction plane's four statements (B6/MR0), against a real libSQL db. The VERB suite
// proves the gates; this one proves the STATEMENTS the verb composes, at the level the verb cannot see:
// that the UNIQUE is what makes a double-add a no-op (physics, not writer discipline), that both directions
// answer HONESTLY through `RETURNING` (the emit rides that answer), and that the window counts SLOTS rather
// than ROWS — the budget bug the rpg tool-calls window paid for once already, where a reroll-heavy slot
// spent the budget on swipes nobody can look at while an older SELECTED variant went dark.

import type { Db } from "@orb/db";
import { messageReactions } from "@orb/db";
import type { ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  deleteReaction,
  insertReaction,
  listChatReactions,
  loadReactorSeatId,
  loadVariantSlotInChat,
} from "../../../../../packages/server/src/domain/chat/persistence/reactions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { addVariant, FROZEN_AT, seedChat, seedMessage, seedParticipant, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

const NO_FLOOR = 0;

async function seedRoom(key: string): Promise<{ readonly userId: UserId; readonly chatId: ChatId; readonly seatId: ChatParticipantId }> {
  const userId = await seedUser(db, castId<Handle>(`u-${key}`));
  const chatId = await seedChat(db, key);
  const seatId = await seedParticipant(db, { chatId, key: `p-${key}`, userId, role: "host" });
  return { userId, chatId, seatId };
}

describe("loadReactorSeatId", () => {
  test("resolves a PRESENT seat and answers undefined for a departed one", async () => {
    const { userId, chatId } = await seedRoom("a");
    expect(await loadReactorSeatId(db, chatId, userId)).toBe(castId("chat_participant_p-a"));

    const gone = await seedUser(db, castId<Handle>("gone"));
    // `leftSeq` set = a departed membership. A departed seat must not be able to react: it is not present,
    // and the guard above this would have refused them anyway — this is the second belt saying the same.
    await seedParticipant(db, { chatId, key: "p-gone", userId: gone, role: "member", leftSeq: 3 });
    expect(await loadReactorSeatId(db, chatId, gone)).toBeUndefined();
  });
});

describe("loadVariantSlotInChat", () => {
  test("answers the slot in-chat, and undefined for a FOREIGN variant or one below the floor", async () => {
    const a = await seedRoom("a");
    const b = await seedRoom("b");
    const mine = await seedMessage(db, a.chatId, 5);
    const theirs = await seedMessage(db, b.chatId, 1);

    expect(await loadVariantSlotInChat(db, a.chatId, mine.variantId, NO_FLOOR)).toEqual({ messageId: mine.messageId });
    // ONE `undefined` for all three misses, so a caller cannot distinguish "not mine" from "does not exist".
    expect(await loadVariantSlotInChat(db, a.chatId, theirs.variantId, NO_FLOOR)).toBeUndefined();
    expect(await loadVariantSlotInChat(db, a.chatId, mine.variantId, 6)).toBeUndefined();
    // The floor is INCLUSIVE (`seq >= floor`) — the member DOES see the row at their own joinSeq.
    expect(await loadVariantSlotInChat(db, a.chatId, mine.variantId, 5)).toEqual({ messageId: mine.messageId });
  });
});

describe("insertReaction / deleteReaction — the toggle's two statements", () => {
  test("the UNIQUE makes a double-add a NO-OP that says so, and a keyed remove answers honestly", async () => {
    const { chatId, seatId } = await seedRoom("a");
    const { variantId } = await seedMessage(db, chatId, 1);
    const row = { variantId, reactorParticipantId: seatId, emoji: "👍", createdAt: FROZEN_AT };

    expect(await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), ...row })).toBe(true);
    // The SECOND add conflicts away to nothing and REPORTS it — which is what keeps the verb from emitting
    // a bus event (and firing every reaction rule in the room) off a click that changed no state.
    expect(await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), ...row })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(1);

    expect(await deleteReaction(db, { variantId, reactorParticipantId: seatId, emoji: "👍" })).toBe(true);
    expect(await deleteReaction(db, { variantId, reactorParticipantId: seatId, emoji: "👍" })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(0);
  });
});

describe("listChatReactions — the window", () => {
  test("counts SLOTS, not rows: a reroll-heavy slot cannot evict an older SELECTED variant", async () => {
    const { chatId, seatId } = await seedRoom("w");
    const older = await seedMessage(db, chatId, 1);
    const hot = await seedMessage(db, chatId, 2);
    // The hot slot has three swipes, every one reacted to — three ROWS on ONE slot.
    const swipeA = await addVariant(db, hot.messageId, 1, "reroll a");
    const swipeB = await addVariant(db, hot.messageId, 2, "reroll b");
    let at = FROZEN_AT;
    for (const variantId of [older.variantId, hot.variantId, swipeA, swipeB]) {
      at += 1;
      await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), variantId, reactorParticipantId: seatId, emoji: "🔥", createdAt: at });
    }

    // A window of ONE SLOT: a row-denominated budget of 1 would have served only the newest swipe and gone
    // dark on the rest of its own slot; a SLOT-denominated one serves every row of that slot.
    const oneSlot = await listChatReactions(db, chatId, { slotWindow: 1, floorSeq: NO_FLOOR });
    expect(oneSlot.map((r) => r.variantId).toSorted()).toEqual([hot.variantId, swipeA, swipeB].toSorted());
    // Widen to two slots and the older SELECTED variant is back.
    const bothSlots = await listChatReactions(db, chatId, { slotWindow: 2, floorSeq: NO_FLOOR });
    expect(bothSlots).toHaveLength(4);
    // …and the floor subtracts the pre-join slot entirely.
    expect(await listChatReactions(db, chatId, { slotWindow: 2, floorSeq: 2 })).toHaveLength(3);
  });
});
