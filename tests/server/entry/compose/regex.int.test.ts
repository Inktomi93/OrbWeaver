// entry/compose/regex — the REVERSE-roster ROOM filter (`resolveVisibleRooms`, REGROSTER) as REGEX RECEIVES
// IT. Rooms carry no `ownerId` (D18), so "which of these rooms may this caller see" is chat's membership
// data and is answered at the composition root, like the sibling `resolveRoomDisplayPolicy`. The domain
// verb's own suite stubs the op; this is the arm that runs the REAL join, end to end through
// `buildRegex().regex.listScriptUsage`.
//
// THE FILTER ITSELF IS NO LONGER REGEX'S (2026-08-19): it moved to `compose/visible-rooms.ts` when databank
// and preset became its second and third consumers, and that file has its own suite for the engine's
// properties. This file stays as the WIRING proof — that regex's roster is still fed by it, unchanged.
//
// THE LOAD-BEARING PROPERTIES:
//   • PRESENT membership only — a room the caller has LEFT keeps its `chat_regex_scripts` row, and naming it
//     would tell an ex-member that a room they can no longer open still runs their script;
//   • a room the caller was NEVER in is likewise absent (the attachment row alone grants nothing);
//   • the op resolves the NAMING INPUTS and never the name (owner pick 2026-08-09): `title` raw,
//     `participantNames` as the chats list spells them, `at` for the roster's recency stamp. Deriving the
//     title here is what produced the reported defect — a second, two-rung copy of a three-rung chain, so
//     every unnamed room read "Untitled chat" while the chats list called it by its cast;
//   • the CAST is the chats list's own rule: character seats by card name, humans by active persona else
//     handle, the CALLER's own seat suppressed (with the floor that keeps a solo room named).

import { chatRegexScripts, personas } from "@orb/db";
import type { Handle, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { buildRegex } from "../../../../packages/server/src/entry/compose/regex.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedCharacter, seedChat, seedParticipant } from "../../domain/chat/_support.ts";
import { principal, seedScript, seedUser } from "../../domain/regex/_support.ts";

const NOW = 1_700_000_000_000;

function build(db: Awaited<ReturnType<typeof freshDb>>): ReturnType<typeof buildRegex> {
  return buildRegex({ db, now: (): number => NOW, audit: (): Promise<void> => Promise.resolve(), emitChatEventLive: (): void => undefined });
}

describe("compose/regex — resolveVisibleRooms (the reverse roster's room filter)", () => {
  test("lists only the rooms the caller is PRESENT in, dropping left and never-joined rooms", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "strip ooc" });

    const present = await seedChat(db, "present", { title: "The Long Dark", updatedAt: NOW });
    const left = await seedChat(db, "left", { title: "Old campaign", updatedAt: NOW });
    const never = await seedChat(db, "never", { title: "Someone else's room", updatedAt: NOW });
    await seedParticipant(db, { chatId: present, key: "p", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: left, key: "l", userId: owner, role: "host", leftSeq: 12 });

    await db.insert(chatRegexScripts).values([present, left, never].map((chatId) => ({ chatId, regexScriptId: scriptId, position: 0 })));

    const usage = await build(db).regex.listScriptUsage({ principal: principal(owner), scriptId });

    expect(usage.rooms.map((room) => room.id)).toEqual([present]);
  });

  // THE FIX (owner pick 2026-08-09). Before it, this room's roster row said "Untitled chat" — naming nobody,
  // while the chats list called the same room "azarael".
  test("an UNNAMED room carries its cast, so the client's one title chain can name it", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "strip ooc" });
    const characterId = await seedCharacter(db, owner, "azarael");

    const untitled = await seedChat(db, "untitled", { title: "   ", updatedAt: NOW });
    await seedParticipant(db, { chatId: untitled, key: "u", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: untitled, key: "c", characterId, role: "member" });
    await db.insert(chatRegexScripts).values([{ chatId: untitled, regexScriptId: scriptId, position: 0 }]);

    const usage = await build(db).regex.listScriptUsage({ principal: principal(owner), scriptId });

    // The authored title arrives RAW — the trim is the chain's, not this op's, so nothing here decides that
    // "   " means unnamed.
    expect(usage.rooms).toEqual([{ id: untitled, title: "   ", participantNames: ["azarael"], at: NOW }]);
  });

  test("the CALLER's own seat is suppressed, and a HUMAN reads as their active persona, else their handle", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const friend = await seedUser(db, { handle: castId<Handle>("friend") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "strip ooc" });
    const personaId = castId<PersonaId>("persona_friend");
    await db.insert(personas).values({ id: personaId, ownerId: friend, name: "Sabine Veyra", description: "" });

    const room = await seedChat(db, "shared", { title: null, updatedAt: NOW });
    await seedParticipant(db, { chatId: room, key: "me", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: room, key: "friend", userId: friend, role: "member", activePersonaId: personaId });
    await db.insert(chatRegexScripts).values([{ chatId: room, regexScriptId: scriptId, position: 0 }]);

    const usage = await build(db).regex.listScriptUsage({ principal: principal(owner), scriptId });

    // "owner" is absent: the caller is in every room they can see, so their own name carries no information
    // and eats the width the row has for the people it is ABOUT (the chats list's `summaryParticipantNames` rule).
    expect(usage.rooms[0]?.participantNames).toEqual(["Sabine Veyra"]);
  });

  test("the SOLO floor: a room with only the caller keeps their name rather than emptying its cast", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "strip ooc" });

    const solo = await seedChat(db, "solo", { title: null, updatedAt: NOW });
    await seedParticipant(db, { chatId: solo, key: "me", userId: owner, role: "host" });
    await db.insert(chatRegexScripts).values([{ chatId: solo, regexScriptId: scriptId, position: 0 }]);

    const usage = await build(db).regex.listScriptUsage({ principal: principal(owner), scriptId });

    // Suppressing the only seat would collapse the row to "Untitled chat" — the very defect this fixes.
    expect(usage.rooms[0]?.participantNames).toEqual(["owner"]);
  });

  test("a seat the caller LEFT is not in anyone's cast, and rooms come back newest-first", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const gone = await seedUser(db, { handle: castId<Handle>("gone") });
    const scriptId = await seedScript(db, { ownerId: owner, name: "strip ooc" });

    const older = await seedChat(db, "older", { title: null, updatedAt: NOW - 10_000 });
    const newer = await seedChat(db, "newer", { title: null, updatedAt: NOW });
    await seedParticipant(db, { chatId: older, key: "o1", userId: owner, role: "host" });
    await seedParticipant(db, { chatId: older, key: "o2", userId: gone, role: "member", leftSeq: 4 });
    await seedParticipant(db, { chatId: newer, key: "n1", userId: owner, role: "host" });
    await db.insert(chatRegexScripts).values([older, newer].map((chatId) => ({ chatId, regexScriptId: scriptId, position: 0 })));

    const usage = await build(db).regex.listScriptUsage({ principal: principal(owner), scriptId });

    expect(usage.rooms.map((room) => room.id)).toEqual([newer, older]);
    // The departed member is gone from the cast too — the roster names who is in the room NOW.
    expect(usage.rooms[1]?.participantNames).toEqual(["owner"]);
  });
});
