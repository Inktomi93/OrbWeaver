import type { Db } from "@orb/db";
import type { CharacterId, ChatParticipantId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  assertForcedCharacterMember,
  isArbiterEligible,
  isBackingUserEnabled,
  isPresent,
  markUserLeft,
  parseParticipant,
  upsertMemberOnJoin,
} from "../../../../../packages/server/src/domain/chat/persistence/participant";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { FROZEN_AT, seedChat, seedParticipant, seedUser } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("parseParticipant — the kind shape", () => {
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

  test("discriminates an agent (userId, no characterId — the human column shape; D60)", () => {
    const userId = castId<UserId>("user_agent");
    expect(parseParticipant({ kind: "agent", userId, characterId: null })).toStrictEqual({
      kind: "agent",
      userId,
    });
  });

  test("rejects the reserved observer kind (un-seatable — carries neither column)", () => {
    expect(() => parseParticipant({ kind: "observer", userId: null, characterId: null })).toThrow("observer");
  });

  test("rejects a corrupt row that breaks the human/character shape", () => {
    const userId = castId<UserId>("user_a");
    const characterId = castId<CharacterId>("character_a");
    expect(() => parseParticipant({ kind: "human", userId, characterId })).toThrow();
    expect(() => parseParticipant({ kind: "human", userId: null, characterId: null })).toThrow();
  });

  test("rejects a corrupt agent row (agent must carry userId, no characterId)", () => {
    const userId = castId<UserId>("user_agent");
    const characterId = castId<CharacterId>("character_a");
    expect(() => parseParticipant({ kind: "agent", userId, characterId })).toThrow();
    expect(() => parseParticipant({ kind: "agent", userId: null, characterId: null })).toThrow();
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

  // The principal kill-switch arm (D60; doc 03 §4): a user-backed seat contributes only while its backing
  // user is enabled; a character seat (no backing user) is never gated by `enabled`.
  test("isBackingUserEnabled gates only USER_BACKED kinds on the principal enabled flag", () => {
    // agent: follows its principal's enabled flag (the containment one-row flip).
    expect(isBackingUserEnabled("agent", true)).toBe(true);
    expect(isBackingUserEnabled("agent", false)).toBe(false);
    // human: also user-backed (a disabled human contributes nothing — moot in a live round, but the axis is coherent).
    expect(isBackingUserEnabled("human", true)).toBe(true);
    expect(isBackingUserEnabled("human", false)).toBe(false);
    // character: NOT user-backed — `enabled` is never consulted (always contributes when present + unmuted).
    expect(isBackingUserEnabled("character", false)).toBe(true);
    expect(isBackingUserEnabled("character", true)).toBe(true);
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
});
