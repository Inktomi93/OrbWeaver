import type { ParticipantKind } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import {
  assertForcedCharacterMember,
  classifyParticipant,
  isArbiterEligible,
  isBackingUserEnabled,
  isPresent,
  markUserLeft,
  parseParticipant,
} from "../../../../../packages/server/src/domain/chat/persistence/participant.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant, seedUser } from "../_support.ts";

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

  test("rejects a corrupt row that breaks the human/character shape", () => {
    const userId = castId<UserId>("user_a");
    const characterId = castId<CharacterId>("character_a");
    expect(() => parseParticipant({ kind: "human", userId, characterId })).toThrow();
    expect(() => parseParticipant({ kind: "human", userId: null, characterId: null })).toThrow();
  });
});

// The non-throwing twin (2026-08-15 one-home consolidation): every 29-site call site routes through this
// instead of `parseParticipant` — silent-skip semantics on a corrupt row, never a throw into a `.filter`/
// `.flatMap`/`.find` roster read.
describe("classifyParticipant — the non-throwing twin", () => {
  test("classifies a human (userId XOR characterId)", () => {
    const userId = castId<UserId>("user_a");
    expect(classifyParticipant({ kind: "human", userId, characterId: null })).toStrictEqual({
      kind: "human",
      userId,
    });
  });

  test("classifies a character", () => {
    const characterId = castId<CharacterId>("character_a");
    expect(classifyParticipant({ kind: "character", userId: null, characterId })).toStrictEqual({
      kind: "character",
      characterId,
    });
  });

  test("returns null (never throws) on a corrupt row that breaks the human/character XOR", () => {
    const userId = castId<UserId>("user_a");
    const characterId = castId<CharacterId>("character_a");
    expect(classifyParticipant({ kind: "human", userId, characterId })).toBeNull();
    expect(classifyParticipant({ kind: "human", userId: null, characterId: null })).toBeNull();
    expect(classifyParticipant({ kind: "character", userId, characterId: null })).toBeNull();
    expect(classifyParticipant({ kind: "character", userId: null, characterId: null })).toBeNull();
  });

  // #1480 item 1 — the DEFAULT arm fails CLOSED. `kind` is DB-CHECK-constrained to PARTICIPANT_KINDS, so
  // an unrecognized kind means a row that bypassed the constraint (a hand-written row, a restored dump, a
  // kind added to the CHECK before this switch). The old `default:` returned the raw runtime string through
  // a `never` binding, so the classification was TRUTHY and `parseParticipant`'s `actor === null` rejection
  // never fired — a corrupt seat read as an actor carrying neither a userId nor a characterId.
  test("an UNRECOGNIZED kind classifies null and parseParticipant rejects it", () => {
    const rogue = { kind: "wraith" as ParticipantKind, userId: null, characterId: null };
    expect(classifyParticipant(rogue)).toBeNull();
    expect(() => parseParticipant(rogue)).toThrow();
    // …and the shape-carrying variants are equally refused: an unrecognized kind is never an actor, however
    // well-formed the id columns look.
    expect(classifyParticipant({ kind: "wraith" as ParticipantKind, userId: castId<UserId>("user_a"), characterId: null })).toBeNull();
    expect(classifyParticipant({ kind: "wraith" as ParticipantKind, userId: null, characterId: castId<CharacterId>("character_a") })).toBeNull();
  });

  // parseParticipant DELEGATES to classifyParticipant — one enforcement mechanism, two exports.
  test("parseParticipant throws exactly where classifyParticipant returns null", () => {
    const corrupt = { kind: "human" as const, userId: castId<UserId>("user_a"), characterId: castId<CharacterId>("character_a") };
    expect(classifyParticipant(corrupt)).toBeNull();
    expect(() => parseParticipant(corrupt)).toThrow();
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
  test("markUserLeft is atomic — stamps leftSeq once, then matches nothing", async () => {
    const userId = await seedUser(db, castId<Handle>("u"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "u", userId, role: "member" });

    const first = await markUserLeft(db, chatId, userId, 4);
    expect(first?.leftSeq).toBe(4);
    expect(await markUserLeft(db, chatId, userId, 5)).toBeUndefined();
  });
});
