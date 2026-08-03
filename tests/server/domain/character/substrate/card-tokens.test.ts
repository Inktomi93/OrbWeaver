// substrate/card-tokens — the advisory list-only heft estimate (derives @orb/kit/tokens). Empty card → 0;
// content → a positive estimate.

import type { CharacterCard } from "@orb/contracts/character";
import { describe } from "vitest";
import { cardTokenSize } from "../../../../../packages/server/src/domain/character/substrate/card-tokens.ts";
import { buildGroupCard } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return { ...buildGroupCard(), name: "", description: null, ...overrides };
}

describe("cardTokenSize", () => {
  test("an all-empty card estimates 0", () => {
    expect(cardTokenSize(card())).toBe(0);
  });

  test("content (name + description + greetings) yields a positive estimate", () => {
    const size = cardTokenSize(card({ name: "Nyx", description: "a long-ish description here", greetings: [{ text: "hello there" }] }));
    expect(size).toBeGreaterThan(0);
  });
});
