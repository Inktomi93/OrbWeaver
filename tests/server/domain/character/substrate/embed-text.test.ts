// substrate/embed-text — the card-text PROJECTION (the ONE home for "what text represents a card"). Pure.
// Load-bearing: field ORDER (last-token pooling weights later fields less), null fields drop out, the
// greetings split (first message vs alternates), {{char}}/{{user}} normalization, and HTML stripping.

import type { CharacterCard } from "@orb/contracts/character";
import { describe, expect, test } from "vitest";
import { buildCardEmbedText } from "../../../../../packages/server/src/domain/character/substrate/embed-text.ts";
import { buildGroupCard } from "../../../../../packages/server/src/domain/character/substrate/group-character.ts";

function card(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return { ...buildGroupCard(), name: "", description: null, greetings: [], ...overrides };
}

describe("buildCardEmbedText", () => {
  test("assembles the identity fields, labeled, in projection order", () => {
    const text = buildCardEmbedText(
      card({
        name: "Bryn",
        description: "a lighthouse keeper",
        personality: "stoic, kind",
        scenario: "a storm-lashed coast",
        greetings: ["Hello, traveler.", "Well met."],
      }),
    );
    expect(text).toBe(
      [
        "Name: Bryn",
        "Description: a lighthouse keeper",
        "Personality: stoic, kind",
        "Scenario: a storm-lashed coast",
        "First Message: Hello, traveler.",
        "Alternate Greetings:\nWell met.",
      ].join("\n"),
    );
  });

  test("drops null / empty fields entirely (a bare card is just its name)", () => {
    expect(buildCardEmbedText(card({ name: "Solo" }))).toBe("Name: Solo");
  });

  test("greetings[0] is the first message; the rest are alternates", () => {
    const text = buildCardEmbedText(card({ name: "X", greetings: ["one", "two", "three"] }));
    expect(text).toContain("First Message: one");
    expect(text).toContain("Alternate Greetings:\ntwo\n---\nthree");
  });

  test("normalizes {{char}}/{{user}} placeholders and strips HTML", () => {
    const text = buildCardEmbedText(
      card({ name: "Ivy", description: "<b>{{char}}</b> greets {{user}} warmly" }),
    );
    expect(text).toBe("Name: Ivy\nDescription: Ivy greets User warmly");
  });
});
