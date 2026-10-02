// entry/compose/visible-rooms — the SHARED leak-safe reverse-room read, tested at the factory rather than
// through one consumer. It was regex's until #276/#279 made it three consumers (regex scripts, databank
// documents, the rpg GM preset), and every one of them hands it a candidate id set off its own junction.
//
// `tests/server/entry/compose/regex.int.test.ts` still drives the SAME code end-to-end through
// `buildRegex().regex.listScriptUsage` — that is the wiring proof, and it stays. This file is the ENGINE's
// own suite: the properties every consumer inherits, asserted once, with no domain in the way.
//
// THE CROSS-TENANT PROPERTY IS THE POINT. An attachment junction row outlives its author's seat, so for
// every consumer the ONLY thing between an ex-member and the name of a room they were removed from is this
// filter. The kicked-owner fixture below is that case, spelled the way it actually happens: the caller
// hosted the room, attached something to it, and their seat was later closed (`leftSeq`).

import { chats, personas } from "@orb/db";
import type { Handle, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { createResolveVisibleRooms } from "../../../../packages/server/src/entry/compose/visible-rooms.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant } from "../../domain/chat/_support.ts";
import { principal, seedUser } from "../../domain/regex/_support.ts";

const NOW = 1_700_000_000_000;

describe("compose/visible-rooms — the shared reverse-roster filter", () => {
  test("a room whose seat the caller LOST is absent, while a live seat resolves", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const present = await seedChat(db, "present", { title: "The Long Dark", updatedAt: NOW });
    const kicked = await seedChat(db, "kicked", { title: "Someone else's table", updatedAt: NOW });
    const never = await seedChat(db, "never", { title: "A room they never joined", updatedAt: NOW });
    await seedParticipant(db, { chatId: present, key: "p", userId: owner, role: "host" });
    // The kicked case: they HOSTED it (so their attachment row is legitimately there) and their seat closed.
    await seedParticipant(db, { chatId: kicked, key: "k", userId: owner, role: "host", leftSeq: 12 });

    const resolve = createResolveVisibleRooms(db);
    const rooms = await resolve(principal(owner), [present, kicked, never]);

    expect(rooms.map((room) => room.id)).toEqual([present]);
    // Nothing about the two withheld rooms rides along — not an id, not a count, not a placeholder.
    const payload = JSON.stringify(rooms);
    expect(payload).not.toContain(kicked);
    expect(payload).not.toContain(never);
  });

  test("it resolves the NAMING INPUTS and never a name: raw title, present characters, caller suppressed", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const friend = await seedUser(db, { handle: castId<Handle>("friend") });
    const personaId = castId<PersonaId>("persona_friend");
    await db.insert(personas).values({ id: personaId, ownerId: friend, name: "Sabine Veyra", description: "" });
    const characterId = await seedCharacter(db, owner, "aveline");

    const room = await seedChat(db, "room", { title: "   ", updatedAt: NOW });
    await seedParticipant(db, { chatId: room, key: "me", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: room, key: "friend", userId: friend, role: "member", activePersonaId: personaId });
    await seedParticipant(db, { chatId: room, key: "c", characterId, role: "member" });

    const rooms = await createResolveVisibleRooms(db)(principal(owner), [room]);

    // The blank title arrives UNTRIMMED — deciding that "   " means unnamed is the client chain's job, and a
    // second copy of that rule here is what produced the "Untitled chat" defect this shape was minted to fix.
    expect(rooms).toEqual([{ id: room, title: "   ", participantNames: ["Sabine Veyra", "aveline"], at: NOW }]);
  });

  test("the SOLO floor keeps a room named, and rooms come back newest-first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const older = await seedChat(db, "older", { title: null, updatedAt: NOW - 10_000 });
    const newer = await seedChat(db, "newer", { title: null, updatedAt: NOW });
    await seedParticipant(db, { chatId: older, key: "o", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: newer, key: "n", userId: owner, role: "host" });

    const rooms = await createResolveVisibleRooms(db)(principal(owner), [older, newer]);

    expect(rooms.map((room) => room.id)).toEqual([newer, older]);
    // Suppressing the only seat would collapse a solo room to "Untitled chat" — the floor keeps the name.
    expect(rooms[0]?.participantNames).toEqual(["owner"]);
  });

  test("an empty candidate set answers empty without touching the room table", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const room = await seedChat(db, "room", { title: "Live", updatedAt: NOW });
    await seedParticipant(db, { chatId: room, key: "me", userId: owner, role: "host" });

    // The candidates are a consumer's junction rows; no junction ⇒ no answer, never "every room you are in".
    expect(await createResolveVisibleRooms(db)(principal(owner), [])).toEqual([]);
    // …and the room really is visible when asked for, so the empty above is about the CANDIDATES.
    const found = await db.select({ id: chats.id }).from(chats).where(eq(chats.id, room));
    expect(found).toHaveLength(1);
  });
});
