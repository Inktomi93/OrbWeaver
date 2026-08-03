// Mirror int-test for domain/export/verbs/createListHostChats — the enumeration the chat bundle descriptor
// streams transcripts over (F8: this two-step query used to run at the composition root). Load-bearing:
// the caller must be the chat's HOST (a chat you merely joined is not yours to back up); the pairing is the
// PRIMARY seated character (first by join order), because the bundle nests each transcript under that
// handle and import re-links by it; a chat with no seated character is SKIPPED (no directory to nest under);
// and a LEFT seat (leftSeq set) counts as neither host nor character.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterHandle, CharacterId, ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createListHostChats } from "../../../../../packages/server/src/domain/export/verbs/list-host-chats.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedCharacter, seedUser } from "../_support.ts";

const NOW = 1_700_000_000_000;

async function seedChat(db: Db, chatId: ChatId): Promise<ChatId> {
  const id = castId<ChatId>(chatId);
  await db.insert(chats).values({
    id,
    title: chatId,
    star: false,
    archived: false,
    temporary: false,
    pendingHostUserId: null,
    anchorPersonaId: null,
    parentChatId: null,
    forkedAt: null,
    compactSummary: null,
    compactedAtSeq: null,
    metadata: null,
    variableValues: null,
    runtimeVariables: null,
    importedFrom: null,
    importHash: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
  return id;
}

interface SeatArgs {
  readonly chatId: ChatId;
  readonly seatId: string;
  readonly userId?: UserId;
  readonly characterId?: CharacterId;
  readonly role: ParticipantRole;
  readonly joinSeq: number;
  readonly leftSeq?: number;
}

async function seat(db: Db, args: SeatArgs): Promise<void> {
  await db.insert(chatParticipants).values({
    id: castId<ChatParticipantId>(args.seatId),
    chatId: args.chatId,
    kind: args.userId === undefined ? "character" : "human",
    ...(args.userId === undefined ? {} : { userId: args.userId }),
    ...(args.characterId === undefined ? {} : { characterId: args.characterId }),
    role: args.role,
    joinedAt: NOW,
    joinSeq: args.joinSeq,
    ...(args.leftSeq === undefined ? {} : { leftSeq: args.leftSeq }),
  });
}

describe("createListHostChats", () => {
  test("pairs each HOSTED chat with its PRIMARY seated character's handle (first by join order)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, { id: castId<CharacterId>("character_hero"), ownerId: owner, handle: castId<CharacterHandle>("hero"), name: "Hero" });
    const villain = await seedCharacter(db, {
      id: castId<CharacterId>("character_villain"),
      ownerId: owner,
      handle: castId<CharacterHandle>("villain"),
      name: "Villain",
    });
    const chatId = await seedChat(db, castId<ChatId>("chat_two_seats"));
    await seat(db, { chatId, seatId: "chatpart_host", userId: owner, role: "host", joinSeq: 0 });
    // Villain joined SECOND — the primary is the earlier join, not whichever row the db returns first.
    await seat(db, { chatId, seatId: "chatpart_hero", characterId: hero, role: "member", joinSeq: 1 });
    await seat(db, { chatId, seatId: "chatpart_villain", characterId: villain, role: "member", joinSeq: 2 });

    const rows = await createListHostChats(makeHarness(db).ctx)({ principal: principal(owner) });

    expect(rows).toEqual([{ chatId, handle: "hero" }]);
  });

  test("a chat with NO seated character is skipped (there is no handle directory to nest it under)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const chatId = await seedChat(db, castId<ChatId>("chat_no_character"));
    await seat(db, { chatId, seatId: "chatpart_host_only", userId: owner, role: "host", joinSeq: 0 });

    expect(await createListHostChats(makeHarness(db).ctx)({ principal: principal(owner) })).toEqual([]);
  });

  test("a chat the caller merely JOINED is not theirs to back up (host gate)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const hero = await seedCharacter(db, { ownerId: stranger, handle: castId<CharacterHandle>("theirs"), name: "Theirs" });
    const chatId = await seedChat(db, castId<ChatId>("chat_theirs"));
    await seat(db, { chatId, seatId: "chatpart_their_host", userId: stranger, role: "host", joinSeq: 0 });
    await seat(db, { chatId, seatId: "chatpart_guest", userId: owner, role: "member", joinSeq: 1 });
    await seat(db, { chatId, seatId: "chatpart_char", characterId: hero, role: "member", joinSeq: 2 });

    expect(await createListHostChats(makeHarness(db).ctx)({ principal: principal(owner) })).toEqual([]);
  });

  test("a LEFT character seat does not pair — the chat falls back to its next present character", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const gone = await seedCharacter(db, { id: castId<CharacterId>("character_gone"), ownerId: owner, handle: castId<CharacterHandle>("gone"), name: "Gone" });
    const present = await seedCharacter(db, {
      id: castId<CharacterId>("character_present"),
      ownerId: owner,
      handle: castId<CharacterHandle>("present"),
      name: "Present",
    });
    const chatId = await seedChat(db, castId<ChatId>("chat_left_seat"));
    await seat(db, { chatId, seatId: "chatpart_host2", userId: owner, role: "host", joinSeq: 0 });
    await seat(db, { chatId, seatId: "chatpart_gone", characterId: gone, role: "member", joinSeq: 1, leftSeq: 5 });
    await seat(db, { chatId, seatId: "chatpart_present", characterId: present, role: "member", joinSeq: 2 });

    expect(await createListHostChats(makeHarness(db).ctx)({ principal: principal(owner) })).toEqual([{ chatId, handle: "present" }]);
  });
});
