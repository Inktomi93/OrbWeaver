// biome-ignore-all lint/style/useNamingConvention: ST settings.json field names (snake_case) appear
// verbatim in these fixtures — they ARE the format.
// Mirror test for domain/import/substrate/tags — the ST tags/tag_map parser. Pins the id→name resolution
// (tag_map ids become names), the per-entity key (the character's card/avatar filename), order-preserving
// de-dupe, the drop of unknown/blank ids and name-less tags, and the never-throws empty contract.

import { describe } from "vitest";
import { parseStTags } from "../../../../../packages/server/src/domain/import/substrate/tags.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("parseStTags", () => {
  test("empty / non-object / no tags → empty map, never throws", () => {
    expect(parseStTags(null).byEntityKey.size).toBe(0);
    expect(parseStTags({}).byEntityKey.size).toBe(0);
    // tag_map present but no tags array → nothing to resolve against.
    expect(parseStTags({ tag_map: { "a.png": ["1"] } }).byEntityKey.size).toBe(0);
    // tags present but no tag_map → no assignments.
    expect(parseStTags({ tags: [{ id: "1", name: "Fantasy" }] }).byEntityKey.size).toBe(0);
  });

  test("resolves tag_map ids to names, keyed by the entity's card/avatar filename", () => {
    const { byEntityKey } = parseStTags({
      tags: [
        { id: "10", name: "Fantasy", color: "rgba(1,2,3,1)" },
        { id: "20", name: "Romance" },
      ],
      tag_map: { "Seraphina.png": ["10", "20"], "empty.png": [] },
    });
    expect(byEntityKey.get("Seraphina.png")).toEqual(["Fantasy", "Romance"]);
    // A key with no ids resolves to nothing → not present.
    expect(byEntityKey.has("empty.png")).toBe(false);
  });

  test("drops unknown ids + name-less tags, de-dupes, preserves order", () => {
    const { byEntityKey } = parseStTags({
      tags: [
        { id: "10", name: "Fantasy" },
        { id: "20", name: "" }, // name-less → not resolvable
        { name: "NoId" }, // id-less → not resolvable
      ],
      tag_map: { "a.png": ["20", "10", "999", "10"] }, // 20 name-less, 999 unknown, 10 twice
    });
    expect(byEntityKey.get("a.png")).toEqual(["Fantasy"]);
  });

  test("a key whose ids all fail to resolve is absent (not an empty array)", () => {
    const { byEntityKey } = parseStTags({
      tags: [{ id: "10", name: "Fantasy" }],
      tag_map: { "b.png": ["999"] },
    });
    expect(byEntityKey.has("b.png")).toBe(false);
  });

  // Old ST profiles store NUMERIC tag ids. A string-only read resolved ZERO tags for the whole profile
  // (verifier finding — a silent whole-feature no-op, not a per-tag drop), so numbers coerce on both sides.
  test("numeric ids resolve (old ST profiles) — on the tag, the map, and mixed", () => {
    const { byEntityKey } = parseStTags({
      tags: [
        { id: 10, name: "Fantasy" }, // numeric tag id
        { id: "20", name: "Romance" },
      ],
      tag_map: { "c.png": [10, "20"], "d.png": ["10"] }, // numeric + string map ids cross-resolve
    });
    expect(byEntityKey.get("c.png")).toEqual(["Fantasy", "Romance"]);
    expect(byEntityKey.get("d.png")).toEqual(["Fantasy"]);
  });
});
