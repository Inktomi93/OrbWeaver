// persistence: the reaction plane's statements (B6/MR0 + the B7 segment/attribution additions), against a
// real libSQL db. The VERB suite proves the gates; this one proves the STATEMENTS the verb composes, at the
// level the verb cannot see: that the PARTIAL UNIQUEs are what make a double-add a no-op per TARGET
// (physics, not writer discipline — and whole-message vs segment are independent toggles), that both
// directions answer HONESTLY through `RETURNING` (the emit rides that answer), that the window counts SLOTS
// rather than ROWS — the budget bug the rpg tool-calls window paid for once already — and that the MR4
// attribution read is SELECTED-variants-only with the reactor's display identity flattened on.

import type { Db } from "@orb/db";
import { messageReactions } from "@orb/db";
import type { ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  deleteReaction,
  insertReaction,
  listAttributionReactions,
  listChatReactions,
  loadCharacterSeatByName,
  loadNewestSelectedSlot,
  loadPresentCastNames,
  loadPresentHostUserId,
  loadReactorSeatId,
  loadVariantSlotInChat,
} from "../../../../../packages/server/src/domain/chat/persistence/reactions.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { addVariant, FROZEN_AT, seedCharacter, seedChat, seedMessage, seedParticipant, seedPersona, seedUser } from "../_support.ts";

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
  test("answers the slot in-chat (kind + canon riding along for the B7 segment validation), undefined for a FOREIGN variant or one below the floor", async () => {
    const a = await seedRoom("a");
    const b = await seedRoom("b");
    const mine = await seedMessage(db, a.chatId, 5);
    const theirs = await seedMessage(db, b.chatId, 1);

    // `kind`/`content` ride the same point read so the segment-claim validation never needs a second query.
    expect(await loadVariantSlotInChat(db, a.chatId, mine.variantId, NO_FLOOR)).toEqual({ messageId: mine.messageId, kind: "standard", content: "body-5" });
    // ONE `undefined` for all three misses, so a caller cannot distinguish "not mine" from "does not exist".
    expect(await loadVariantSlotInChat(db, a.chatId, theirs.variantId, NO_FLOOR)).toBeUndefined();
    expect(await loadVariantSlotInChat(db, a.chatId, mine.variantId, 6)).toBeUndefined();
    // The floor is INCLUSIVE (`seq >= floor`) — the member DOES see the row at their own joinSeq.
    expect(await loadVariantSlotInChat(db, a.chatId, mine.variantId, 5)).toEqual({ messageId: mine.messageId, kind: "standard", content: "body-5" });
  });
});

describe("insertReaction / deleteReaction — the toggle's two statements", () => {
  test("the whole-message UNIQUE makes a double-add a NO-OP that says so, and a keyed remove answers honestly", async () => {
    const { chatId, seatId } = await seedRoom("a");
    const { variantId } = await seedMessage(db, chatId, 1);
    const row = { variantId, reactorParticipantId: seatId, emoji: "👍", segment: null, createdAt: FROZEN_AT };

    expect(await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), ...row })).toBe(true);
    // The SECOND add conflicts away to nothing and REPORTS it — which is what keeps the verb from emitting
    // a bus event (and firing every reaction rule in the room) off a click that changed no state.
    expect(await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), ...row })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(1);

    expect(await deleteReaction(db, { variantId, reactorParticipantId: seatId, emoji: "👍", segmentIndex: null })).toBe(true);
    expect(await deleteReaction(db, { variantId, reactorParticipantId: seatId, emoji: "👍", segmentIndex: null })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(0);
  });

  test("B7: whole-message and segment-anchored are INDEPENDENT toggles — each arm dedupes and deletes only itself", async () => {
    const { chatId, seatId } = await seedRoom("s");
    const { variantId } = await seedMessage(db, chatId, 1);
    const base = { variantId, reactorParticipantId: seatId, emoji: "😂", createdAt: FROZEN_AT };
    const anchor = { segmentIndex: 1, segmentSpeaker: "Bob", segmentSnippet: "the line" };

    // Same seat, same emoji, same variant — the whole-message row and the line-anchored row COEXIST
    // (MA-2 §4: "😂 on Bob's line" and "😂 on the whole message" are different statements). A single
    // unique over the nullable index could not hold this AND still dedupe the whole-message arm.
    expect(await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), ...base, segment: null })).toBe(true);
    expect(await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), ...base, segment: anchor })).toBe(true);
    // Each arm's OWN double-add is the no-op — the segment partial unique has teeth too.
    expect(await insertReaction(db, { id: mintTypeId(ID_PREFIX.messageReaction), ...base, segment: anchor })).toBe(false);
    expect(await db.select().from(messageReactions)).toHaveLength(2);

    // The keyed DELETE removes ONLY its own arm: dropping the segment row leaves the whole-message row.
    expect(await deleteReaction(db, { variantId, reactorParticipantId: seatId, emoji: "😂", segmentIndex: 1 })).toBe(true);
    const left = await db.select().from(messageReactions);
    expect(left).toHaveLength(1);
    expect(left[0]?.segmentIndex).toBeNull();
  });

  test("B7: the trio-coherence CHECK makes a snippet-without-index row UNREPRESENTABLE (born physics, not writer discipline)", async () => {
    const { chatId, seatId } = await seedRoom("c");
    const { variantId } = await seedMessage(db, chatId, 1);

    // A raw statement (below `insertReaction`, whose own shape can't spell this) — the CHECK is the layer
    // that refuses a writer bug no TypeScript shape can see at runtime. (libsql wraps the SQLite
    // constraint text behind a generic "Failed query" message, so the refusal is asserted as
    // refused-and-nothing-landed rather than by message.)
    await expect(
      db.insert(messageReactions).values({
        id: mintTypeId(ID_PREFIX.messageReaction),
        variantId,
        reactorParticipantId: seatId,
        emoji: "👍",
        segmentIndex: null,
        segmentSpeaker: null,
        segmentSnippet: "orphan snippet",
        createdAt: FROZEN_AT,
      }),
    ).rejects.toThrow();
    expect(await db.select().from(messageReactions)).toHaveLength(0);

    // THE PLANTED POSITIVE CONTROL: the COHERENT twin — identical in every byte except the index is
    // present — inserts fine, isolating the trio-shape CHECK (not some column/FK accident) as what
    // refused the orphan above.
    await db.insert(messageReactions).values({
      id: mintTypeId(ID_PREFIX.messageReaction),
      variantId,
      reactorParticipantId: seatId,
      emoji: "👍",
      segmentIndex: 0,
      segmentSpeaker: null,
      segmentSnippet: "orphan snippet",
      createdAt: FROZEN_AT,
    });
    expect(await db.select().from(messageReactions)).toHaveLength(1);
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
      await insertReaction(db, {
        id: mintTypeId(ID_PREFIX.messageReaction),
        variantId,
        reactorParticipantId: seatId,
        emoji: "🔥",
        segment: null,
        createdAt: at,
      });
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

describe("the B7 room loaders", () => {
  test("loadPresentCastNames: PRESENT character seats only — departed seats and humans never key the span grammar", async () => {
    const { userId, chatId } = await seedRoom("cast");
    const alice = await seedCharacter(db, userId, "Alice");
    const bob = await seedCharacter(db, userId, "Bob");
    await seedParticipant(db, { chatId, key: "c-alice", characterId: alice });
    await seedParticipant(db, { chatId, key: "c-bob", characterId: bob, leftSeq: 4 });

    // Bob DEPARTED: his plain `Bob:` lines are prose now — the server parse and the client mirror
    // (`speakerThemesByName` keys) must both drop him or a picked index stops surviving the round trip.
    expect(await loadPresentCastNames(db, chatId)).toEqual(["Alice"]);
  });

  test("loadPresentHostUserId: the present host, and undefined for a hostless room", async () => {
    const { userId, chatId } = await seedRoom("h");
    expect(await loadPresentHostUserId(db, chatId)).toBe(userId);

    // A hostless room (every host departed) — the caller falls to DEFAULT_CHAT_BEHAVIOR, never a crash.
    const bare = await seedChat(db, "hostless");
    expect(await loadPresentHostUserId(db, bare)).toBeUndefined();
  });

  test("loadCharacterSeatByName: exact (trimmed) present-character match; departed/unknown answer undefined", async () => {
    const { userId, chatId } = await seedRoom("n");
    const alice = await seedCharacter(db, userId, "Alice");
    const bob = await seedCharacter(db, userId, "Bob");
    const mute = await seedCharacter(db, userId, "Mute");
    const aliceSeat = await seedParticipant(db, { chatId, key: "n-alice", characterId: alice });
    await seedParticipant(db, { chatId, key: "n-bob", characterId: bob, leftSeq: 2 });
    const muteSeat = await seedParticipant(db, { chatId, key: "n-mute", characterId: mute, disabled: true });

    expect(await loadCharacterSeatByName(db, chatId, "Alice")).toEqual({ participantId: aliceSeat, characterName: "Alice", disabled: false });
    // The model's whitespace is tolerated (`.trim()`); its spelling is not — the tool narrates the miss.
    expect(await loadCharacterSeatByName(db, chatId, "  Alice  ")).toEqual({ participantId: aliceSeat, characterName: "Alice", disabled: false });
    expect(await loadCharacterSeatByName(db, chatId, "Bob")).toBeUndefined();
    expect(await loadCharacterSeatByName(db, chatId, "Nobody")).toBeUndefined();
    // #1402 — a MUTED seat still RESOLVES (it is present); the read carries its kill-switch and the verb
    // refuses on it, so the model hears "muted" rather than "no such character".
    expect(await loadCharacterSeatByName(db, chatId, "Mute")).toEqual({ participantId: muteSeat, characterName: "Mute", disabled: true });
  });

  test("loadNewestSelectedSlot: the newest slot's SELECTED variant at/above the floor; undefined for an empty room", async () => {
    const { chatId } = await seedRoom("new");
    expect(await loadNewestSelectedSlot(db, chatId, 0)).toBeUndefined();

    await seedMessage(db, chatId, 1, { content: "first" });
    const newest = await seedMessage(db, chatId, 2, { kind: "narrator", content: "second" });
    expect(await loadNewestSelectedSlot(db, chatId, 0)).toEqual({
      messageId: newest.messageId,
      variantId: newest.variantId,
      kind: "narrator",
      content: "second",
    });

    // #1402 — the D16 arm: a floor ABOVE the room's head is the same `undefined` an empty room gives (never
    // the next one down, which would hand a clamped caller the pre-join slot they may not read).
    expect(await loadNewestSelectedSlot(db, chatId, 2)).toMatchObject({ messageId: newest.messageId });
    expect(await loadNewestSelectedSlot(db, chatId, 3)).toBeUndefined();
  });
});

describe("listAttributionReactions — the MR4 read", () => {
  test("SELECTED variants only: a reaction parked on a dead swipe is never narrated into the prompt", async () => {
    const { chatId, seatId } = await seedRoom("sel");
    const slot = await seedMessage(db, chatId, 1);
    const deadSwipe = await addVariant(db, slot.messageId, 1, "the road not taken");
    await insertReaction(db, {
      id: mintTypeId(ID_PREFIX.messageReaction),
      variantId: slot.variantId,
      reactorParticipantId: seatId,
      emoji: "👍",
      segment: null,
      createdAt: FROZEN_AT + 1,
    });
    await insertReaction(db, {
      id: mintTypeId(ID_PREFIX.messageReaction),
      variantId: deadSwipe,
      reactorParticipantId: seatId,
      emoji: "😂",
      segment: null,
      createdAt: FROZEN_AT + 2,
    });

    const rows = await listAttributionReactions(db, chatId, { slotWindow: 10, floorSeq: NO_FLOOR });
    expect(rows.map((r) => r.variantId)).toEqual([slot.variantId]);
  });

  test("flattens the reactor's DISPLAY identity: a character seat its character's name, a human seat its active persona's", async () => {
    const { userId, chatId } = await seedRoom("who");
    const alice = await seedCharacter(db, userId, "Alice");
    const aliceSeat = await seedParticipant(db, { chatId, key: "who-alice", characterId: alice });
    const memberUser = await seedUser(db, castId<Handle>("who-m"));
    const persona = await seedPersona(db, memberUser, "Vex");
    const memberSeat = await seedParticipant(db, { chatId, key: "who-m", userId: memberUser, activePersonaId: persona });
    const slot = await seedMessage(db, chatId, 1);
    await insertReaction(db, {
      id: mintTypeId(ID_PREFIX.messageReaction),
      variantId: slot.variantId,
      reactorParticipantId: aliceSeat,
      emoji: "🔥",
      segment: null,
      createdAt: FROZEN_AT + 1,
    });
    await insertReaction(db, {
      id: mintTypeId(ID_PREFIX.messageReaction),
      variantId: slot.variantId,
      reactorParticipantId: memberSeat,
      emoji: "👍",
      segment: null,
      createdAt: FROZEN_AT + 2,
    });

    const rows = await listAttributionReactions(db, chatId, { slotWindow: 10, floorSeq: NO_FLOOR });
    expect(rows.map((r) => [r.emoji, r.reactorCharacterName, r.reactorPersonaName])).toEqual([
      ["🔥", "Alice", null],
      ["👍", null, "Vex"],
    ]);
  });

  test("the slot window keys the NEWEST-reacted slots, rows come back chronological by slot, and the floor subtracts", async () => {
    const { chatId, seatId } = await seedRoom("win");
    const oldSlot = await seedMessage(db, chatId, 1);
    const newSlot = await seedMessage(db, chatId, 2);
    // The OLD slot has the NEWEST reaction — recency is reaction-time, not slot seq.
    await insertReaction(db, {
      id: mintTypeId(ID_PREFIX.messageReaction),
      variantId: newSlot.variantId,
      reactorParticipantId: seatId,
      emoji: "👍",
      segment: null,
      createdAt: FROZEN_AT + 1,
    });
    await insertReaction(db, {
      id: mintTypeId(ID_PREFIX.messageReaction),
      variantId: oldSlot.variantId,
      reactorParticipantId: seatId,
      emoji: "😂",
      segment: null,
      createdAt: FROZEN_AT + 2,
    });

    const oneSlot = await listAttributionReactions(db, chatId, { slotWindow: 1, floorSeq: NO_FLOOR });
    expect(oneSlot.map((r) => r.emoji)).toEqual(["😂"]);
    // Both slots in the window: NARRATION order is slot-chronological (seq), not reaction-chronological.
    const both = await listAttributionReactions(db, chatId, { slotWindow: 2, floorSeq: NO_FLOOR });
    expect(both.map((r) => r.messageSeq)).toEqual([1, 2]);
    // The floor (the host's D16 floor in production — a host holds none, but the statement honors it).
    expect((await listAttributionReactions(db, chatId, { slotWindow: 2, floorSeq: 2 })).map((r) => r.messageSeq)).toEqual([2]);
  });
});
