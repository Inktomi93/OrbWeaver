// Unit: keyword normalization — lowercase, leading-article fold, trailing-punctuation trim, ≥4-char floor.

import { describe } from "vitest";
import { normalizeKeyword } from "../../../../../packages/server/src/domain/discovery/cooccurrence/utils.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("normalizeKeyword", () => {
  test("lowercases and folds a leading article", () => {
    expect(normalizeKeyword("The Crown")).toBe("crown");
    expect(normalizeKeyword("a Dragon")).toBe("dragon");
    expect(normalizeKeyword("AN Empire")).toBe("empire");
  });

  test("trims trailing punctuation/whitespace", () => {
    expect(normalizeKeyword("duel.")).toBe("duel");
    expect(normalizeKeyword("  castle!!  ")).toBe("castle");
  });

  test("drops tokens below the 4-char floor (post-normalization)", () => {
    expect(normalizeKeyword("the sky")).toBeNull(); // "sky" = 3 chars
    expect(normalizeKeyword("a b")).toBeNull();
    expect(normalizeKeyword("fire")).toBe("fire"); // exactly 4 survives
  });
});
