// biome-ignore-all lint/style/useNamingConvention: ST Character-Card wire field names (snake_case) appear
// verbatim in these card fixtures — they ARE the format.
// Mirror test for domain/import/substrate/card — the import-domain card ENTRY: the PNG/JSON parsers (compose
// the kit codec + the serde), the whole-file importHash, and the flatten-to-create-input validate seam.

import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { cardFromJson } from "@orb/server/kit/serde/card";
import { describe } from "vitest";
// The substrate-internal helpers (cardToCreateInput/importFileHash) are not front-door exports — this is
// their mirror test, so it reaches the module directly (same relative-path pattern as `_support.ts`).
import {
  cardToCreateInput,
  importFileHash,
  parseCardJson,
  parseCardPng,
} from "../../../../../packages/server/src/domain/import/substrate/card.ts";
import { expect, test } from "../../../../support/fixtures";

const FAILED_VALIDATION = /failed validation/u;

// A real-shaped ST V3 card object (the parsers' input under test).
const V3_CARD = {
  spec: "chara_card_v3",
  spec_version: "3.0",
  data: {
    name: "Aria",
    description: "A wandering bard.",
    personality: "curious",
    scenario: "a tavern",
    first_mes: "Hello there!",
    alternate_greetings: ["Well met."],
    mes_example: "",
    system_prompt: "",
    post_history_instructions: "",
    creator: "nate",
    creator_notes: "",
    character_version: "1.0",
    tags: ["bard", "fantasy", "  Bard ", "", "music"],
    extensions: {},
  },
};

const V3_JSON = JSON.stringify(V3_CARD);
const encoder = new TextEncoder();

// A minimal valid PNG (8-byte signature + a zero-length IEND chunk) — enough for writeCardChunk to embed a
// card tEXt chunk before IEND, which parseCardPng then reads back.
const MINIMAL_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

// Unwrap a non-null parse result (the codebase guard idiom — narrows away the `| null` for both tsc and the
// biome optional-chain rule).
function expectParsed<T>(value: T | null): T {
  if (value === null) {
    throw new Error("expected a parsed card");
  }
  return value;
}

describe("parseCardJson", () => {
  test("parses a bare V3 JSON card (bytes) → canonical card", () => {
    const parsed = expectParsed(parseCardJson(encoder.encode(V3_JSON), "fallback"));
    expect(parsed.card.name).toBe("Aria");
    expect(parsed.card.greetings).toEqual(["Hello there!", "Well met."]);
    expect(parsed.card.creator).toBe("nate");
  });

  test("extracts card tags RAW (no trim/empty-drop/dedupe — the tag chokepoint owns canonicalization)", () => {
    // V3_CARD.data.tags = ["bard", "fantasy", "  Bard ", "", "music"] — extraction now only filters
    // non-strings; trim, empty-drop, and case-insensitive dedupe happen at the resolve-or-create chokepoint.
    const parsed = expectParsed(parseCardJson(encoder.encode(V3_JSON), "fallback"));
    expect(parsed.tags).toEqual(["bard", "fantasy", "  Bard ", "", "music"]);
  });

  test("skips non-string tag entries (tolerant IN) but keeps every string verbatim", () => {
    const parsed = expectParsed(
      parseCardJson('{"data":{"name":"X","description":"d","tags":["a",42,null,"  b  ",{}]}}', "x"),
    );
    expect(parsed.tags).toEqual(["a", "  b  "]);
  });

  test("a card with no tags field yields an empty tag list", () => {
    const parsed = expectParsed(
      parseCardJson('{"data":{"name":"NoTags","description":"x"}}', "fallback"),
    );
    expect(parsed.tags).toEqual([]);
  });

  test("strips a leading UTF-8 BOM before parsing", () => {
    const withBom = `﻿${V3_JSON}`;
    expect(expectParsed(parseCardJson(withBom, "fallback")).card.name).toBe("Aria");
  });

  test("returns null on undecodable JSON", () => {
    expect(parseCardJson("not json {{", "fallback")).toBeNull();
  });
});

describe("parseCardPng", () => {
  test("reads a card embedded in a PNG tEXt chunk → canonical card + tags", () => {
    const png = writeCardChunk(MINIMAL_PNG, V3_JSON);
    const parsed = expectParsed(parseCardPng(png, "fallback"));
    expect(parsed.card.name).toBe("Aria");
    expect(parsed.card.greetings).toEqual(["Hello there!", "Well met."]);
    expect(parsed.tags).toEqual(["bard", "fantasy", "  Bard ", "", "music"]);
  });

  test("returns null for bytes carrying no card chunk", () => {
    expect(parseCardPng(MINIMAL_PNG, "fallback")).toBeNull();
  });
});

describe("importFileHash", () => {
  test("is deterministic over identical bytes + differs across content", () => {
    const a = encoder.encode("identical");
    const b = encoder.encode("identical");
    const c = encoder.encode("different");
    expect(importFileHash(a)).toBe(importFileHash(b));
    expect(importFileHash(a)).not.toBe(importFileHash(c));
  });
});

describe("cardToCreateInput", () => {
  test("flattens → create input: handle slugified, null description → '', avatar attached", () => {
    const card = cardFromJson(V3_CARD, "fallback");
    const input = cardToCreateInput(card, null);
    expect(input.handle).toBe("aria");
    expect(input.name).toBe("Aria");
    expect(input.description).toBe("A wandering bard.");
    expect(input.greetings).toEqual(["Hello there!", "Well met."]);
    expect(input.avatarAssetId).toBeNull();
  });

  test("null description normalizes to the empty string (the one required create field)", () => {
    const card = cardFromJson({ data: { name: "NoDesc" } }, "fallback");
    expect(cardToCreateInput(card, null).description).toBe("");
  });

  test("throws ImportCardError(card_invalid) when the normalized card fails the canonical schema", () => {
    // An all-whitespace/empty name folds to "" → fails createCharacterSchema's name min(1).
    const card = cardFromJson({ data: { name: "" } }, "");
    expect(() => cardToCreateInput(card, null)).toThrowError(FAILED_VALIDATION);
  });
});
