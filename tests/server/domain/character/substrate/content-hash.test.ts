// substrate/content-hash — the card flatten. Load-bearing: deterministic (same semantic content → same
// hash), provenance-INDEPENDENT (changing creator/notes/extensions must NOT move the hash — they don't
// version a card), and content-SENSITIVE (a semantic edit moves it).

import type { CharacterCard } from "@orb/contracts/character";
import { describe, expect, test } from "vitest";
import { cardContentHash } from "../../../../../packages/server/src/domain/character/substrate/content-hash.ts";
import { buildGroupCard } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return { ...buildGroupCard(), name: "Base", description: "a card", ...overrides };
}

describe("cardContentHash", () => {
  test("is deterministic for identical content", () => {
    expect(cardContentHash(card())).toBe(cardContentHash(card()));
  });

  test("ignores provenance/derived fields (creator / creatorNotes / extensions / refinery)", () => {
    const base = cardContentHash(card());
    expect(cardContentHash(card({ creator: "someone" }))).toBe(base);
    expect(cardContentHash(card({ creatorNotes: "a note" }))).toBe(base);
    expect(cardContentHash(card({ extensions: { vendor: 1 } }))).toBe(base);
    expect(cardContentHash(card({ refinery: { score: 5, analysis: null } }))).toBe(base);
  });

  test("changes when the semantic content changes", () => {
    expect(cardContentHash(card({ description: "different" }))).not.toBe(cardContentHash(card()));
    expect(cardContentHash(card({ greetings: ["hi"] }))).not.toBe(cardContentHash(card()));
  });
});
