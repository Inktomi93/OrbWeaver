// How a raw analytics VALUE is spoken on the corpus surface — the two casing/label rules and the surface's
// one similarity spelling (side-eye corpus re-pass #2: P2-5, P3-2, P3-4). Pure, so it is unit-pinned here
// and the rendered halves are pinned by the surfaces that use them.

import { describe } from "vitest";
import { facetLabel, matchWord, percent, sentenceCase } from "../../../../../packages/client/src/features/discovery/lib/corpus-vocabulary.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("percent (P2-5)", () => {
  test("a 0-1 similarity reads as a whole percent — the surface's ONE spelling", () => {
    expect(percent(0.31)).toBe("31%");
    expect(percent(1)).toBe("100%");
    expect(percent(0)).toBe("0%");
    // The digit that distinguishes 0.8813 from 0.8809 is noise a reader cannot act on.
    expect(percent(0.8813)).toBe(percent(0.8809));
  });
});

describe("sentenceCase (P3-2)", () => {
  test("a distilled chain leads with a capital and is otherwise untouched", () => {
    expect(sentenceCase("fantasy · melancholic")).toBe("Fantasy · melancholic");
    expect(sentenceCase("")).toBe("");
    expect(sentenceCase("Already cased")).toBe("Already cased");
  });
});

describe("facetLabel (P3-4)", () => {
  test("the un-classifiable tokens become a name a reader can accept", () => {
    expect(facetLabel("none")).toBe("Unclassified");
    expect(facetLabel("None")).toBe("Unclassified");
    expect(facetLabel("unknown")).toBe("Unclassified");
    expect(facetLabel("  ")).toBe("Unclassified");
  });

  test("…and a real label is only cased — the VALUE is never rewritten", () => {
    expect(facetLabel("anime")).toBe("Anime");
    expect(facetLabel("noir portrait")).toBe("Noir portrait");
  });
});

describe("matchWord", () => {
  test("a portrait-card cosine is bucketed into words at its cut points", () => {
    expect(matchWord(0.45)).toBe("Strong");
    expect(matchWord(0.3)).toBe("Strong");
    expect(matchWord(0.25)).toBe("Good");
    expect(matchWord(0.2)).toBe("Good");
    expect(matchWord(0.05)).toBe("Weak");
  });
});
