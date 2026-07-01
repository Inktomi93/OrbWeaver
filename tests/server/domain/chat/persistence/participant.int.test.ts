import type { Db } from "@orb/db";
import type { CharacterId, ChatParticipantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  assertForcedCharacterMember,
  isArbiterEligible,
  isPresent,
  markParticipantLeft,
  markUserLeft,
  parseParticipant,
  setParticipantRole,
  upsertMemberOnJoin,
} from "../../../../../packages/server/src/domain/chat/persistence/participant";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, seedCharacter, seedChat, seedParticipant, seedUser } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("parseParticipant — the actor XOR", () => {
  test("discriminates a human (userId XOR characterId)", () => {
    const userId = castId<UserId>("user_a");
    expect(parseParticipant({ kind: "human", userId, characterId: null })).toStrictEqual({
      kind: "human",
      userId,
    });
  });

  test("discriminates a character", () => {
    const characterId = castId<CharacterId>("character_a");
    expect(parseParticipant({ kind: "character", userId: null, characterId })).toStrictEqual({
      kind: "character",
      characterId,
    });
  });

  test("rejects the reserved observer kind (not wired into the XOR)", () => {
    expect(() => parseParticipant({ kind: "observer", userId: null, characterId: null })).toThrow(
      "observer",
    );
  });

  test("rejects a corrupt row that breaks the XOR", () => {
    const userId = castId<UserId>("user_a");
    const characterId = castId<CharacterId>("character_a");
    expect(() => parseParticipant({ kind: "human", userId, characterId })).toThrow();
    expect(() => parseParticipant({ kind: "human", userId: null, characterId: null })).toThrow();
  });
});

describe("present-and-contributing predicates", () => {
  test("isPresent tracks leftSeq", () => {
    expect(isPresent({ leftSeq: null })).toBe(true);
    expect(isPresent({ leftSeq: 4 })).toBe(false);
  });

  test("isArbiterEligible requires present AND not muted", () => {
    expect(isArbiterEligible({ leftSeq: null, disabled: false })).toBe(true);
    expect(isArbiterEligible({ leftSeq: null, disabled: true })).toBe(false);
    expect(isArbiterEligible({ leftSeq: 2, disabled: false })).toBe(false);
  });
});

describe("assertForcedCharacterMember", () => {
  test("throws when a character is given any role but member", () => {
    expect(() => assertForcedCharacterMember({ kind: "character", role: "host" })).toThrow();
  });

  test("allows a character member and a human host", () => {
    expect(() => assertForcedCharacterMember({ kind: "character", role: "member" })).not.toThrow();
    expect(() => assertForcedCharacterMember({ kind: "human", role: "host" })).not.toThrow();
  });
});

describe("membership lifecycle writes", () => {
  test("upsertMemberOnJoin inserts a fresh member (role server-forced, leftSeq null)", async () => {
    const userId = await seedUser(db, "u");
    const chatId = await seedChat(db, "a");
    const row = await upsertMemberOnJoin(db, {
      participantId: castId<ChatParticipantId>("chat_participant_new"),
      chatId,
      userId,
      joinSeq: 0,
      now: FROZEN_AT,
    });
    expect(row?.role).toBe("member");
    expect(row?.leftSeq).toBeNull();
    expect(row?.joinSeq).toBe(0);
  });

  test("upsertMemberOnJoin re-joins a LEFT member: advances joinSeq, clears leftSeq, keeps the row id", async () => {
    const userId = await seedUser(db, "u");
    const chatId = await seedChat(db, "a");
    const existing = await seedParticipant(db, {
      chatId,
      key: "u",
      userId,
      role: "member",
      joinSeq: 0,
      leftSeq: 2,
    });
    const row = await upsertMemberOnJoin(db, {
      participantId: castId<ChatParticipantId>("chat_participant_ignored"),
      chatId,
      userId,
      joinSeq: 9,
      now: FROZEN_AT,
    });
    expect(row?.id).toBe(existing);
    expect(row?.joinSeq).toBe(9);
    expect(row?.leftSeq).toBeNull();
  });

  test("upsertMemberOnJoin is an idempotent no-op for an ALREADY-present member (undefined)", async () => {
    const userId = await seedUser(db, "u");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "u", userId, role: "member" });
    const row = await upsertMemberOnJoin(db, {
      participantId: castId<ChatParticipantId>("chat_participant_x"),
      chatId,
      userId,
      joinSeq: 5,
      now: FROZEN_AT,
    });
    expect(row).toBeUndefined();
  });

  test("markUserLeft is atomic — stamps leftSeq once, then matches nothing", async () => {
    const userId = await seedUser(db, "u");
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "u", userId, role: "member" });

    const first = await markUserLeft(db, chatId, userId, 4);
    expect(first?.leftSeq).toBe(4);
    expect(await markUserLeft(db, chatId, userId, 5)).toBeUndefined();
  });

  test("markParticipantLeft kicks by id (works for a character with no userId)", async () => {
    const owner = await seedUser(db, "owner");
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, owner, "c");
    const pid = await seedParticipant(db, {
      chatId,
      key: "c",
      characterId: charId,
      role: "member",
    });
    const left = await markParticipantLeft(db, pid, 7);
    expect(left?.leftSeq).toBe(7);
  });

  test("setParticipantRole swaps the role (host handoff)", async () => {
    const userId = await seedUser(db, "u");
    const chatId = await seedChat(db, "a");
    const pid = await seedParticipant(db, { chatId, key: "u", userId, role: "member" });
    expect((await setParticipantRole(db, pid, "host"))?.role).toBe("host");
  });
});
