// entry/compose/room-reach — THE ENTITY→ROOM REACH ENGINE, over a real seeded roster + real junction rows.
// Retargets `emit-character-updated.int.test.ts` (deleted in the same commit — the character fan is now the
// `character` row of this table, fanning a LIVE-ONLY `roomEntityChanged` instead of a durable `chatUpdated`);
// its two cases survive verbatim in intent as the first describe block.
//
// What each case pins is the REACH PREDICATE, which is the whole engine: a room hears an entity edit exactly
// when its member-visible projection reads that entity RIGHT NOW. The failure modes worth a test are all
// directional — a departed seat still hearing (a D28 snapshot-identity leak), a live seat NOT hearing (the
// owner's reported symptom), and a room reached twice emitting twice (a refetch storm on the member's device).
// The emit is a capturing spy: the live-only publish is the transport's own tested seam.

import type { LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, globalBooks, personaBooks, worldBooks, worldEntries } from "@orb/db";
import type { ChatId, Handle, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createRoomEntityFan } from "@orb/server/entry/compose";
import { describe } from "vitest";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant, seedPersona, seedUser } from "../../domain/chat/_support.ts";

const FROZEN_AT = 1_700_000_000_000;

/** A capturing fan: returns the spy's buffer plus the built subscriber. */
function spyFan(db: Db): { readonly captured: LiveOnlyChatBusEvent[]; readonly fan: ReturnType<typeof createRoomEntityFan> } {
  const captured: LiveOnlyChatBusEvent[] = [];
  return { captured, fan: createRoomEntityFan(db, (event) => captured.push(event)) };
}

/** The rooms an entity kind reached, as a SET — the engine promises no emit ORDER, and a Set comparison
 *  also fails loudly on a duplicate collapsing (each case that cares asserts the raw length too). */
function roomsFor(captured: readonly LiveOnlyChatBusEvent[], entity: string): Set<ChatId> {
  // The live-only lane carries `chatDeleted` too (R1-4a) — narrow to the bridge's member before reading
  // `entity`, so this helper reds honestly if the engine ever fans something that is not an entity change.
  return new Set(captured.filter((e) => e.type === "roomEntityChanged" && e.entity === entity).map((e) => e.chatId));
}

/** Insert a `world_books` row (+ one entry, so the book is a realistic assembly source). */
async function seedBook(db: Db, ownerId: UserId, key: string): Promise<WorldBookId> {
  const id = castId<WorldBookId>(`world_book_${key}`);
  await db.insert(worldBooks).values({ id, ownerId, name: key, description: null, createdAt: FROZEN_AT, updatedAt: FROZEN_AT });
  await db.insert(worldEntries).values({
    id: castId(`world_entry_${key}`),
    worldBookId: id,
    title: key,
    content: `${key} lore`,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

describe("room-reach: character — present seats only", () => {
  test("fans to every PRESENT-seat chat, never a departed / non-seat / other-character chat", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_owner"));
    const edited = await seedCharacter(db, owner, "edited");
    const other = await seedCharacter(db, owner, "other");

    // `edited` is a present seat in A + B; DEPARTED (leftSeq stamped) in C; never seated in D (where `other` sits).
    const chatA = await seedChat(db, "rr_a");
    const chatB = await seedChat(db, "rr_b");
    const chatC = await seedChat(db, "rr_c");
    const chatD = await seedChat(db, "rr_d");
    await seedParticipant(db, { chatId: chatA, key: "a_edited", characterId: edited });
    await seedParticipant(db, { chatId: chatB, key: "b_edited", characterId: edited });
    await seedParticipant(db, { chatId: chatC, key: "c_edited", characterId: edited, leftSeq: 7 });
    await seedParticipant(db, { chatId: chatD, key: "d_other", characterId: other });

    const { captured, fan } = spyFan(db);
    await fan({ type: "character.updated", characterId: edited, contentChanged: true });

    expect(roomsFor(captured, "character")).toEqual(new Set([chatA, chatB]));
    expect(captured).toHaveLength(2);
    // ID-FREE by design (contracts §3.3): the payload is the room + the kind and NOTHING else — no
    // characterId. A member of a room must not learn the id of an owner-plane row they cannot read, and the
    // client's filters are path-level anyway, so an id would buy no narrower targeting. Asserted as the
    // event's exact KEY SET, which reds the day someone "helpfully" adds the entity id back.
    expect(Object.keys(captured[0] ?? {}).sort()).toEqual(["chatId", "entity", "type"]);
  });

  test("a FLAG-ONLY edit (`contentChanged:false`) still fans — a co-member's open room must hear a theme/star change", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_flag_owner"));
    const seated = await seedCharacter(db, owner, "flagged");
    const chat = await seedChat(db, "rr_flag");
    await seedParticipant(db, { chatId: chat, key: "flag_seat", characterId: seated });

    const { captured, fan } = spyFan(db);
    await fan({ type: "character.updated", characterId: seated, contentChanged: false });

    expect(roomsFor(captured, "character")).toEqual(new Set([chat]));
  });

  test("a character seated in NO present chat fans nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_none_owner"));
    const lonely = await seedCharacter(db, owner, "lonely");

    const { captured, fan } = spyFan(db);
    await fan({ type: "character.updated", characterId: lonely, contentChanged: true });

    expect(captured).toEqual([]);
  });
});

describe("room-reach: persona — active seats + the chat anchor", () => {
  test("fans to a present seat's ACTIVE persona chat and to an ANCHORED chat, never a departed seat or another persona's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_p_owner"));
    const edited = await seedPersona(db, owner, "rr_edited");
    const other = await seedPersona(db, owner, "rr_other");

    const seatChat = await seedChat(db, "rr_p_seat");
    const leftChat = await seedChat(db, "rr_p_left");
    // The ANCHOR is the room's `{{user}}` even with nobody seated on it — the case a seat-only resolver misses.
    const anchorChat = await seedChat(db, "rr_p_anchor", { anchorPersonaId: edited });
    const otherChat = await seedChat(db, "rr_p_other");
    await seedParticipant(db, { chatId: seatChat, key: "p_seat", userId: owner, activePersonaId: edited });
    await seedParticipant(db, { chatId: leftChat, key: "p_left", userId: owner, activePersonaId: edited, leftSeq: 3 });
    await seedParticipant(db, { chatId: otherChat, key: "p_other", userId: owner, activePersonaId: other });

    const { captured, fan } = spyFan(db);
    await fan({ type: "persona.updated", personaId: edited });

    expect(roomsFor(captured, "persona")).toEqual(new Set([seatChat, anchorChat]));
    expect(captured).toHaveLength(2);
  });

  test("a chat that BOTH seats and anchors the persona is fanned ONCE (the dedup — two hits, one refetch)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_p1_owner"));
    const persona = await seedPersona(db, owner, "rr_both");
    const chat = await seedChat(db, "rr_p_both", { anchorPersonaId: persona });
    await seedParticipant(db, { chatId: chat, key: "p_both", userId: owner, activePersonaId: persona });

    const { captured, fan } = spyFan(db);
    await fan({ type: "persona.updated", personaId: persona });

    expect(roomsFor(captured, "persona")).toEqual(new Set([chat]));
    // The DEDUP, stated as a count: two reach hits (seat + anchor), exactly one emit.
    expect(captured).toHaveLength(1);
  });
});

describe("room-reach: world-info — the assembly pool's four scopes", () => {
  test("reaches chat-scope, character-scope (present seats), persona-scope and global-scope rooms; not a departed seat's", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_w_owner"));
    const book = await seedBook(db, owner, "rr_reached");
    const unrelated = await seedBook(db, owner, "rr_unrelated");

    const chatScoped = await seedChat(db, "rr_w_chat");
    const charScoped = await seedChat(db, "rr_w_char");
    const charDeparted = await seedChat(db, "rr_w_char_left");
    const personaScoped = await seedChat(db, "rr_w_persona");
    const hostedByOwner = await seedChat(db, "rr_w_global");
    const strangerRoom = await seedChat(db, "rr_w_stranger");
    const untouched = await seedChat(db, "rr_w_untouched");

    const seatedChar = await seedCharacter(db, owner, "rr_w_char_id");
    const persona = await seedPersona(db, owner, "rr_w_persona_id");
    const stranger = await seedUser(db, castId<Handle>("rr_w_stranger_user"));

    await db.insert(chatBooks).values({ chatId: chatScoped, worldBookId: book, createdAt: FROZEN_AT });
    await db.insert(characterBooks).values({ characterId: seatedChar, worldBookId: book, role: "auxiliary", createdAt: FROZEN_AT });
    await db.insert(personaBooks).values({ personaId: persona, worldBookId: book, createdAt: FROZEN_AT });
    await db.insert(globalBooks).values({ worldBookId: book, createdAt: FROZEN_AT });
    // The unrelated book is attached to the untouched room — proof the reach is book-keyed, not owner-keyed.
    await db.insert(chatBooks).values({ chatId: untouched, worldBookId: unrelated, createdAt: FROZEN_AT });

    await seedParticipant(db, { chatId: charScoped, key: "w_char", characterId: seatedChar });
    await seedParticipant(db, { chatId: charDeparted, key: "w_char_left", characterId: seatedChar, leftSeq: 4 });
    await seedParticipant(db, { chatId: personaScoped, key: "w_persona", userId: owner, activePersonaId: persona });
    // GLOBAL scope is tenant-scoped by the pool to the room's HOST owner, so the reach is the book owner's
    // hosted rooms — never a stranger's room, even though a global book "fires for every chat".
    await seedParticipant(db, { chatId: hostedByOwner, key: "w_global_host", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: strangerRoom, key: "w_stranger_host", userId: stranger, role: "host" });

    const { captured, fan } = spyFan(db);
    await fan({ type: "world-info.updated", bookId: book });

    expect(roomsFor(captured, "world-info")).toEqual(new Set([chatScoped, charScoped, personaScoped, hostedByOwner]));
    expect(captured).toHaveLength(4);
  });

  test("an ANCHORED persona's book reaches the room even with its owner unseated", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_w2_owner"));
    const persona = await seedPersona(db, owner, "rr_w2_persona");
    const book = await seedBook(db, owner, "rr_w2_book");
    const anchored = await seedChat(db, "rr_w2_anchor", { anchorPersonaId: persona });
    await db.insert(personaBooks).values({ personaId: persona, worldBookId: book, createdAt: FROZEN_AT });

    const { captured, fan } = spyFan(db);
    await fan({ type: "world-info.updated", bookId: book });

    expect(roomsFor(captured, "world-info")).toEqual(new Set([anchored]));
  });

  test("an attached-nowhere book fans nothing", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_w3_owner"));
    const book = await seedBook(db, owner, "rr_w3_orphan");
    await seedChat(db, "rr_w3_chat");

    const { captured, fan } = spyFan(db);
    await fan({ type: "world-info.updated", bookId: book });

    expect(captured).toEqual([]);
  });
});

describe("room-reach: the explicit no-reach arm", () => {
  test("`asset.created` fans nothing — an immutable new blob is nobody's stale projection", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, castId<Handle>("rr_asset_owner"));
    const seated = await seedCharacter(db, owner, "rr_asset_char");
    const chat = await seedChat(db, "rr_asset_chat");
    await seedParticipant(db, { chatId: chat, key: "asset_seat", characterId: seated });

    const { captured, fan } = spyFan(db);
    await fan({ type: "asset.created", assetId: castId("asset_rr") });

    expect(captured).toEqual([]);
  });
});
