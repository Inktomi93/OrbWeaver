// The corpus omnibox's RESULT TEXT rules — the pure half of a search row (the rendered half is
// corpus-search-results.ct.tsx). Each case here is a defect the 2026-08-19 corpus re-pass MEASURED on the
// live surface, reduced to the string decision behind it.

import { describe } from "vitest";
import {
  chatSubtitle,
  dedupeByEvidence,
  evidenceScent,
  snippetForDisplay,
} from "../../../../../packages/client/src/features/discovery/lib/corpus-result-text.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("chatSubtitle", () => {
  test("an authored room title wins; an unnamed room falls through to its cast, never an id", () => {
    expect(chatSubtitle("Amethyst Hollow", "Selene")).toBe("Amethyst Hollow");
    expect(chatSubtitle(null, "Selene")).toBe("Selene");
    expect(chatSubtitle(null, null)).not.toContain("chat_");
  });
});

describe("snippetForDisplay (C1)", () => {
  test("markdown is flattened — emphasis, stacked block markers and fences never reach the reader", () => {
    expect(snippetForDisplay("**Selene** said:\n\n> ### the copper tub\n\nThey settle in.")).toBe("Selene said: the copper tub They settle in.");
  });

  test("a long excerpt is cut on a WORD boundary and ends in an ellipsis — never half a word", () => {
    // The wire slices at 280 chars mid-word and the row then closes the quotation mark after the cut, which
    // is the "fake closing quote" the re-pass named. A 300-word line is past the display budget either way.
    const long = `${"the harvest is in and the evening is quiet ".repeat(20)}finally`;
    const shown = snippetForDisplay(long);
    expect(shown.endsWith("…")).toBe(true);
    expect(shown.length).toBeLessThanOrEqual(240);
    // The character before the ellipsis is the end of a word, not a mid-word cut.
    expect(long.startsWith(shown.slice(0, -1))).toBe(true);
    expect(long[shown.length - 1]).toBe(" ");
  });

  test("a short excerpt is returned whole — no ellipsis where nothing was cut", () => {
    expect(snippetForDisplay("She slips between the stalls.")).toBe("She slips between the stalls.");
  });
});

describe("evidenceScent (C3)", () => {
  test("a complete preview reads as a location; an incomplete one says how much is under it", () => {
    expect(evidenceScent(2, 2, 1)).toBe("2 matching moments in 1 room");
    expect(evidenceScent(1, 1, 1)).toBe("1 matching moment in 1 room");
    // The measured defect: "79 matching moments" over three excerpts in two rooms.
    expect(evidenceScent(79, 3, 2)).toBe("79 matching moments — showing 3 in 2 rooms");
  });
});

describe("dedupeByEvidence (C2)", () => {
  test("byte-identical evidence collapses to the FIRST hit — the server's order is descending relevance", () => {
    const hits = [
      { id: "a", text: "the copper tub", relevance: 0.91 },
      { id: "b", text: "the copper tub", relevance: 0.9 },
      { id: "c", text: "the farmhouse porch", relevance: 0.8 },
    ];
    expect(dedupeByEvidence(hits, (hit) => hit.text).map((hit) => hit.id)).toEqual(["a", "c"]);
  });

  test("surrounding whitespace is not an identity — the same block trimmed differently is still one answer", () => {
    const hits = [{ text: "the copper tub" }, { text: "  the copper tub \n" }];
    expect(dedupeByEvidence(hits, (hit) => hit.text)).toHaveLength(1);
  });
});
