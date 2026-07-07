// The draft-config store (J2/J3): a new chat's pre-send edits (greeting/roster/group/room-overrides/
// injections) keyed by `draftKey`, sparse by construction so an untouched draft commits byte-identical
// to a plain new chat. Exercised through the non-hook `readDraftConfig` snapshot (the hooks need a React
// render — the `message-edit-draft.test.ts` posture). Every test clears its key: the store is a module
// singleton, so leaks would cross tests.

import {
  addDraftCharacter,
  clearDraftConfig,
  EMPTY_DRAFT_CONFIG,
  readDraftConfig,
  setDraftGreeting,
  setDraftGroupConfig,
  setDraftInjections,
  setDraftRoomOverrides,
  setDraftRosterOverride,
} from "@orb/client/state";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const KEY_A = "draft-cfg-a";
const KEY_B = "draft-cfg-b";
const CHAR_A = castId<CharacterId>("character_draftcfgaaaaaaaaaaaaa");
const CHAR_B = castId<CharacterId>("character_draftcfgbbbbbbbbbbbbb");

describe("draft-config store", () => {
  test("an untouched draft reads the frozen EMPTY_DRAFT_CONFIG (same ref — the selector-stability floor)", () => {
    expect(readDraftConfig(KEY_A)).toBe(EMPTY_DRAFT_CONFIG);
  });

  test("setDraftGreeting stores raw text per founding character, sparse (only set chars present)", () => {
    setDraftGreeting(KEY_A, CHAR_A, "Hello from A");
    expect(readDraftConfig(KEY_A).greetings?.[CHAR_A]).toBe("Hello from A");
    expect(readDraftConfig(KEY_A).greetings?.[CHAR_B]).toBeUndefined();

    setDraftGreeting(KEY_A, CHAR_B, "Hello from B");
    expect(readDraftConfig(KEY_A).greetings?.[CHAR_A]).toBe("Hello from A"); // untouched by B's write
    expect(readDraftConfig(KEY_A).greetings?.[CHAR_B]).toBe("Hello from B");
    clearDraftConfig(KEY_A);
  });

  test("an empty-string greeting is stored (it clears to the card default at commit, not a no-op)", () => {
    setDraftGreeting(KEY_A, CHAR_A, "");
    expect(readDraftConfig(KEY_A).greetings?.[CHAR_A]).toBe("");
    clearDraftConfig(KEY_A);
  });

  test("setDraftRosterOverride merges deviating fields (disabled, then talkativeness — both survive)", () => {
    setDraftRosterOverride(KEY_A, CHAR_A, { disabled: true });
    setDraftRosterOverride(KEY_A, CHAR_A, { talkativeness: 0.7 });
    expect(readDraftConfig(KEY_A).rosterOverrides?.[CHAR_A]).toEqual({
      disabled: true,
      talkativeness: 0.7,
    });
    clearDraftConfig(KEY_A);
  });

  test("addDraftCharacter appends to the added cast and dedupes a repeat", () => {
    addDraftCharacter(KEY_A, CHAR_A);
    addDraftCharacter(KEY_A, CHAR_B);
    addDraftCharacter(KEY_A, CHAR_A); // dup — ignored
    expect(readDraftConfig(KEY_A).addedCharacterIds).toEqual([CHAR_A, CHAR_B]);
    clearDraftConfig(KEY_A);
  });

  test("group / room-overrides / injections each round-trip through their replace setter", () => {
    setDraftGroupConfig(KEY_A, DEFAULT_GROUP_CONFIG);
    setDraftRoomOverrides(KEY_A, { scenario: "a shared scene" });
    setDraftInjections(KEY_A, []);
    const cfg = readDraftConfig(KEY_A);
    expect(cfg.groupConfig).toEqual(DEFAULT_GROUP_CONFIG);
    expect(cfg.roomOverrides).toEqual({ scenario: "a shared scene" });
    expect(cfg.injections).toEqual([]);
    clearDraftConfig(KEY_A);
  });

  test("clearDraftConfig drops the whole config — back to the frozen empty ref", () => {
    setDraftGreeting(KEY_A, CHAR_A, "temp");
    expect(readDraftConfig(KEY_A)).not.toBe(EMPTY_DRAFT_CONFIG);
    clearDraftConfig(KEY_A);
    expect(readDraftConfig(KEY_A)).toBe(EMPTY_DRAFT_CONFIG);
  });

  test("per-draftKey isolation — editing one draft never touches another's config", () => {
    setDraftGreeting(KEY_A, CHAR_A, "a's greeting");
    setDraftGreeting(KEY_B, CHAR_A, "b's greeting");
    expect(readDraftConfig(KEY_A).greetings?.[CHAR_A]).toBe("a's greeting");
    expect(readDraftConfig(KEY_B).greetings?.[CHAR_A]).toBe("b's greeting");

    clearDraftConfig(KEY_A);
    expect(readDraftConfig(KEY_A)).toBe(EMPTY_DRAFT_CONFIG);
    expect(readDraftConfig(KEY_B).greetings?.[CHAR_A]).toBe("b's greeting"); // untouched by A's clear
    clearDraftConfig(KEY_B);
  });
});
