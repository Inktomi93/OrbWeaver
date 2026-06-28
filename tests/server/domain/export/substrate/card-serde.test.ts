// Unit: the LOCAL stopgap card serde (export.md serde core — FLAG[serde-consolidate]). The load-bearing
// invariant: the strict OUT emitter `buildCardV3` produces a card that re-parses cleanly through the
// SHARED IN adapter `cardFromJson` (@orb/server/kit/serde/card) — the one-file round-trip that makes
// import → export → reimport lossless (export.md inv 1 + Esoteric). Also pins `exportBookEntry`'s at-depth
// re-encode + the constant/insertion_order mapping (export.md Esoteric §"at-depth position:4").
//
// NOTE: cardFromJson does NOT carry tags or the embedded lorebook (those are external junctions in
// orbweaver, not card columns), so the round-trip is asserted over the card-CONTENT fields only — tags +
// books are exercised end-to-end in the verb int test.

import type { CharacterCard } from "@orb/contracts/character";
import { characterCardV3Schema } from "@orb/contracts/character";
import { regexScriptSchema } from "@orb/contracts/regex";
import { messageRoleToSt } from "@orb/kit/message-role";
import { cardFromJson } from "@orb/server/kit/serde/card";
import { describe, expect, test } from "vitest";
import type { ExportCardFields } from "../../../../../packages/server/src/domain/export/contract/params.ts";
import {
  buildCardV3,
  exportBookEntry,
} from "../../../../../packages/server/src/domain/export/substrate/card-serde.ts";

const REGEX_SCRIPT = regexScriptSchema.parse({
  id: "r1",
  name: "trim",
  findRegex: "a",
  replaceString: "b",
  placement: [],
});

/** A fully-populated flat card (the typed-column source the verb projects from). */
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
