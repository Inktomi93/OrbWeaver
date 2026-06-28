// biome-ignore-all lint/style/useNamingConvention: ST Character-Card wire field names (snake_case) appear
// verbatim in these card fixtures — they ARE the format.
// Mirror test for @orb/server/kit/serde/card — the ONE card serde core: the tolerant IN-flatten
// (cardFromJson), the shared content hash (cardContentHash, PD-33), and the strict OUT-emitter
// (buildCardV3 + exportBookEntry, PD-44). Asserts the multi-spec normalize (V3 / V1 / Pygmalion), the
// typed-promotion mapping (depthPrompt / greetings / residual extensions), the hash invariants the dedup
// relies on (key-order independence + the deliberate provenance EXCLUSION), and the load-bearing
// round-trip: buildCardV3 → cardFromJson is lossless over the card content fields (export.md inv 1).

import type { CharacterCard } from "@orb/contracts/character";
import { characterCardV3Schema } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import { messageRoleToSt } from "@orb/kit/message-role";
import type { ExportCardFields } from "@orb/server/kit/serde/card";
import {
  buildCardV3,
  cardContentHash,
  cardFromJson,
  exportBookEntry,
} from "@orb/server/kit/serde/card";
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

// ── the OUT half: buildCardV3 + exportBookEntry (PD-44) ────────────────────────────────────────────────

const REGEX_SCRIPT = regexScriptSchema.parse({
  id: "r1",
  name: "trim",
  findRegex: "a",
  replaceString: "b",
  placement: [],
});

/** A fully-populated flat card (the typed-column source the export verb projects from). */
function fullFields(): ExportCardFields {
  return {
    name: "Aria",
    description: "A brave knight",
    personality: "bold",
    scenario: "a castle",
    greetings: ["Hello there", "Hi again"],
    exampleMessages: "<START>example",
    systemPrompt: "be brave",
    postHistoryInstructions: "stay in character",
    creatorNotes: "made with love",
    creator: "nate",
    cardVersion: "1.2",
    tags: ["fantasy", "knight"],
    extensions: { vendorExtra: "kept" },
    regexScripts: [REGEX_SCRIPT],
    depthPrompt: { prompt: "remember the oath", depth: 3, role: "system" },
  };
}

describe("buildCardV3 → cardFromJson round-trip", () => {
  test("the strict OUT emitter re-parses cleanly through the tolerant IN adapter (content fields)", () => {
    const fields = fullFields();
    const card = buildCardV3(fields, []);
    const back: CharacterCard = cardFromJson(card, "fallback");

    expect(back.name).toBe("Aria");
    expect(back.description).toBe("A brave knight");
    expect(back.personality).toBe("bold");
    expect(back.scenario).toBe("a castle");
    expect(back.greetings).toEqual(["Hello there", "Hi again"]);
    expect(back.exampleMessages).toBe("<START>example");
    expect(back.systemPrompt).toBe("be brave");
    expect(back.postHistoryInstructions).toBe("stay in character");
    expect(back.creatorNotes).toBe("made with love");
    expect(back.creator).toBe("nate");
    expect(back.cardVersion).toBe("1.2");
    expect(back.depthPrompt).toEqual({ prompt: "remember the oath", depth: 3, role: "system" });
    expect(back.regexScripts).toEqual([REGEX_SCRIPT]);
    // residual vendor extras survive; the promoted keys are NOT left behind in `extensions`.
    expect(back.extensions).toEqual({ vendorExtra: "kept" });
  });

  test('null/empty card fields round-trip to null (emit `""` → re-parse null)', () => {
    const fields: ExportCardFields = {
      ...fullFields(),
      description: null,
      personality: null,
      scenario: null,
      exampleMessages: null,
      systemPrompt: null,
      postHistoryInstructions: null,
      creatorNotes: null,
      creator: null,
      cardVersion: null,
      depthPrompt: null,
      extensions: null,
      regexScripts: [],
    };
    const back = cardFromJson(buildCardV3(fields, []), "fallback");
    expect(back.description).toBeNull();
    expect(back.creator).toBeNull();
    expect(back.depthPrompt).toBeNull();
    expect(back.extensions).toBeNull();
    expect(back.regexScripts).toEqual([]);
  });
});

describe("buildCardV3 wire shape", () => {
  test("emits a valid V3 card; greetings split into first_mes + alternate_greetings; tags passthrough", () => {
    const card = buildCardV3(fullFields(), []);
    expect(card.spec).toBe("chara_card_v3");
    expect(card.data.first_mes).toBe("Hello there");
    expect(card.data.alternate_greetings).toEqual(["Hi again"]);
    expect(card.data.tags).toEqual(["fantasy", "knight"]);
    // parsing its own output is idempotent (the emitter already `.parse`s, but pin the shape).
    expect(() => characterCardV3Schema.parse(card)).not.toThrow();
  });

  test("a null depthPrompt DROPS extensions.depth_prompt; regex_scripts is always written", () => {
    const card = buildCardV3({ ...fullFields(), depthPrompt: null, regexScripts: [] }, []);
    expect(card.data.extensions).not.toHaveProperty("depth_prompt");
    expect(card.data.extensions["regex_scripts"]).toEqual([]);
  });

  test("character_book is emitted only when there are entries", () => {
    const without = buildCardV3(fullFields(), []);
    expect(without.data).not.toHaveProperty("character_book");
    const withBook = buildCardV3(fullFields(), [
      {
        keys: ["k"],
        content: "c",
        enabled: true,
        priority: 0,
        title: "t",
        ignoreBudget: false,
        metadata: null,
      },
    ]);
    expect(withBook.data.character_book?.entries).toHaveLength(1);
  });
});

describe("exportBookEntry", () => {
  test("a keyword entry: constant=false, insertion_order=priority, comment=title", () => {
    const out = exportBookEntry({
      keys: ["dragon"],
      content: "lore",
      enabled: true,
      priority: 7,
      title: "Dragons",
      ignoreBudget: false,
      metadata: null,
    });
    expect(out["constant"]).toBe(false);
    expect(out["insertion_order"]).toBe(7);
    expect(out["comment"]).toBe("Dragons");
    expect(out["keys"]).toEqual(["dragon"]);
  });

  test("a keyless entry derives constant=true (the keyless-always-on heuristic)", () => {
    const out = exportBookEntry({
      keys: [],
      content: "always",
      enabled: true,
      priority: 0,
      title: "Setting",
      ignoreBudget: false,
      metadata: null,
    });
    expect(out["constant"]).toBe(true);
  });

  test("a depth-inject entry re-encodes extensions.{position:4, depth, role-via-bimap} + preserves extras", () => {
    const out = exportBookEntry({
      keys: ["k"],
      content: "c",
      enabled: true,
      priority: 0,
      title: "t",
      ignoreBudget: true,
      metadata: { inject: { depth: 4, role: "assistant" }, extensions: { custom: 1 } },
    });
    const ext = out["extensions"] as Record<string, unknown>;
    expect(ext["position"]).toBe(4);
    expect(ext["depth"]).toBe(4);
    expect(ext["role"]).toBe(messageRoleToSt("assistant"));
    expect(ext["custom"]).toBe(1);
    expect(out["ignoreBudget"]).toBe(true);
  });
});
