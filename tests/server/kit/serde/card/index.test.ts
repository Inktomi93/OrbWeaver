// biome-ignore-all lint/style/useNamingConvention: ST Character-Card wire field names (snake_case) appear
// verbatim in these card fixtures — they ARE the format.
// Mirror test for @orb/server/kit/serde/card — the tolerant card-flatten (cardFromJson) + the shared
// content hash (cardContentHash, PD-33). Asserts the multi-spec normalize (V3 / V1 / Pygmalion), the
// typed-promotion mapping (depthPrompt / greetings / residual extensions), and the hash invariants the
// dedup relies on: key-order independence + the deliberate provenance EXCLUSION.

import type { CharacterCard } from "@orb/contracts/character";
import { cardContentHash, cardFromJson } from "@orb/server/kit/serde/card";
import { describe, expect, test } from "vitest";

/** A minimal-but-complete canonical card (the hash tests mutate copies of this). */
function baseCard(overrides: Partial<CharacterCard> = {}): CharacterCard {
  return {
    name: "Aria",
    description: "A wandering bard.",
    personality: "curious",
    scenario: "a tavern",
    greetings: ["Hello there!", "Well met."],
    exampleMessages: null,
    systemPrompt: null,
    postHistoryInstructions: null,
    depthPrompt: null,
    creatorNotes: null,
    creator: null,
    cardVersion: null,
    regexScripts: [],
    extensions: null,
    avatarAssetId: null,
    refinery: null,
    ...overrides,
  };
}

describe("cardFromJson", () => {
  test("flattens a V3 card → the canonical shape (greetings[0]=first_mes, typed promotions, residual ext)", () => {
    const v3 = {
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Aria",
        description: "A wandering bard.",
        personality: "curious",
        scenario: "a tavern",
        first_mes: "Hello there!",
        alternate_greetings: ["Well met.", "Oh, hi."],
        mes_example: "An example exchange.",
        system_prompt: "You are Aria.",
        post_history_instructions: "Stay in character.",
        creator: "nate",
        creator_notes: "be kind",
        character_version: "1.2",
        extensions: {
          depth_prompt: { prompt: "Aria hums softly.", depth: 2, role: "system" },
          vendor_extra: { foo: 1 },
        },
      },
    };

    const card = cardFromJson(v3, "fallback");

    expect(card.name).toBe("Aria");
    expect(card.description).toBe("A wandering bard.");
    // greetings[0] is first_mes; the rest are alternate_greetings (order preserved).
    expect(card.greetings).toEqual(["Hello there!", "Well met.", "Oh, hi."]);
    expect(card.systemPrompt).toBe("You are Aria.");
    expect(card.postHistoryInstructions).toBe("Stay in character.");
    expect(card.creator).toBe("nate");
    expect(card.cardVersion).toBe("1.2");
    expect(card.depthPrompt).toEqual({ prompt: "Aria hums softly.", depth: 2, role: "system" });
    // residual extensions = everything MINUS the promoted depth_prompt/regex_scripts keys.
    expect(card.extensions).toEqual({ vendor_extra: { foo: 1 } });
    // not on the card wire — set separately at import / pipeline.
    expect(card.avatarAssetId).toBeNull();
    expect(card.refinery).toBeNull();
  });

  test("normalizes a V1 (root-level fields) card", () => {
    const v1 = {
      name: "Bram",
      description: "A gruff smith.",
      personality: "stoic",
      scenario: "a forge",
      first_mes: "What do you want?",
    };
    const card = cardFromJson(v1, "fallback");
    expect(card.name).toBe("Bram");
    expect(card.description).toBe("A gruff smith.");
    expect(card.greetings).toEqual(["What do you want?"]);
  });

  test("normalizes a Pygmalion-Gradio (char_name) card", () => {
    const pyg = {
      char_name: "Cleo",
      char_persona: "A clever fox.",
      char_greeting: "*grins*",
      world_scenario: "a meadow",
      example_dialogue: "{{user}}: hi",
    };
    const card = cardFromJson(pyg, "fallback");
    expect(card.name).toBe("Cleo");
    expect(card.description).toBe("A clever fox.");
    expect(card.scenario).toBe("a meadow");
    expect(card.greetings).toEqual(["*grins*"]);
  });

  test("uses the fallback name when the card carries none", () => {
    expect(cardFromJson({ data: { description: "x" } }, "From Filename").name).toBe(
      "From Filename",
    );
  });

  test("drops the ST creator-notes placeholder", () => {
    const card = cardFromJson(
      { data: { name: "X", creator_notes: "Creator's notes go here." } },
      "fb",
    );
    expect(card.creatorNotes).toBeNull();
  });
});

describe("cardContentHash", () => {
  test("is deterministic + independent of key insertion order", () => {
    const a = baseCard();
    // a logically-identical card built with a different field order hashes the same (stable-stringify).
    const b = baseCard({ scenario: "a tavern", description: "A wandering bard." });
    expect(cardContentHash(a)).toBe(cardContentHash(b));
  });

  test("EXCLUDES provenance fields (re-attribution must not change identity)", () => {
    const base = baseCard();
    const hash = cardContentHash(base);
    // creator / creatorNotes / cardVersion / extensions / refinery / avatarAssetId are NOT hashed.
    expect(cardContentHash(baseCard({ creator: "someone" }))).toBe(hash);
    expect(cardContentHash(baseCard({ creatorNotes: "notes" }))).toBe(hash);
    expect(cardContentHash(baseCard({ cardVersion: "9.9" }))).toBe(hash);
    expect(cardContentHash(baseCard({ extensions: { x: 1 } }))).toBe(hash);
  });

  test("CHANGES when a semantic field changes", () => {
    const hash = cardContentHash(baseCard());
    expect(cardContentHash(baseCard({ name: "Different" }))).not.toBe(hash);
    expect(cardContentHash(baseCard({ greetings: ["new"] }))).not.toBe(hash);
  });
});
