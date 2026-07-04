// The DOM-free fuzzy-search core: empty query passthrough (original order), ranked matching,
// per-call field scoping over one index, boost ordering, and the limit cap.

import { fuzzySearch } from "@orb/ui/fuzzy-search";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

interface Card {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

const CARDS: readonly Card[] = [
  { id: "c1", name: "Kira", description: "a ranger of the northern vale" },
  { id: "c2", name: "Brint", description: "a merchant who admires kira" },
  { id: "c3", name: "Vale", description: "a sentient fortress" },
];

const FIELDS = { fields: ["name", "description"] as const };

describe("fuzzySearch", () => {
  test("empty/whitespace query returns the items unchanged, original order", () => {
    expect(fuzzySearch(CARDS, "", FIELDS)).toBe(CARDS);
    expect(fuzzySearch(CARDS, "   ", FIELDS)).toBe(CARDS);
  });

  test("matches across indexed fields and maps back to the ORIGINAL item objects", () => {
    const hits = fuzzySearch(CARDS, "kira", FIELDS);
    expect(hits.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
    expect(hits.every((c) => CARDS.includes(c))).toBe(true); // original refs, not widened copies
  });

  test("per-call searchFields scopes ONE index without a rebuild (name-only excludes c2)", () => {
    const nameOnly = fuzzySearch(CARDS, "kira", { ...FIELDS, searchFields: ["name"] });
    expect(nameOnly.map((c) => c.id)).toEqual(["c1"]);
  });

  test("boost reorders: name matches outrank description matches", () => {
    const hits = fuzzySearch(CARDS, "vale", { ...FIELDS, boost: { name: 4 } });
    expect(hits[0]?.id).toBe("c3"); // "Vale" the NAME beats "vale" in c1's description
    expect(hits.map((c) => c.id).sort()).toEqual(["c1", "c3"]);
  });

  test("limit caps the result set", () => {
    expect(fuzzySearch(CARDS, "kira", { ...FIELDS, limit: 1 })).toHaveLength(1);
  });
});
