// The corpus omnibox's RESULT TEXT rules — the pure half of a search row (the rendered half is
// corpus-search-results.ct.tsx). Each case here is a defect the 2026-08-19 corpus re-pass MEASURED on the
// live surface, reduced to the string decision behind it.

import type { DiscoverSegment } from "@orb/contracts/search";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  chatSubtitle,
  evidenceScent,
  groupByEvidence,
  roomNumberingHint,
  snippetForDisplay,
} from "../../../../../packages/client/src/features/discovery/lib/corpus-result-text.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { corpusSceneSource } from "../../../../support/node/corpus-source.ts";

describe("chatSubtitle", () => {
  test("an authored room title wins; an unnamed room falls through to its cast, never an id", () => {
    expect(chatSubtitle("Amethyst Hollow", "Iris")).toBe("Amethyst Hollow");
    expect(chatSubtitle(null, "Iris")).toBe("Iris");
    expect(chatSubtitle(null, null)).not.toContain("chat_");
  });
});

describe("snippetForDisplay (C1)", () => {
  test("markdown is flattened — emphasis, stacked block markers and fences never reach the reader", () => {
    expect(snippetForDisplay("**Iris** said:\n\n> ### the copper tub\n\nThey settle in.")).toBe("Iris said: the copper tub They settle in.");
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

describe("groupByEvidence (C2)", () => {
  test("byte-identical evidence groups every original occurrence in rank order", () => {
    const hits = [
      { id: "a", text: "the copper tub", relevance: 0.91 },
      { id: "b", text: "the copper tub", relevance: 0.9 },
      { id: "c", text: "the farmhouse porch", relevance: 0.8 },
    ];
    expect([...groupByEvidence(hits, (hit) => hit.text).values()].map((group) => group.map((hit) => hit.id))).toEqual([["a", "b"], ["c"]]);
  });

  test("surrounding whitespace is not an identity — the same block trimmed differently is still one answer", () => {
    const hits = [{ text: "the copper tub" }, { text: "  the copper tub \n" }];
    expect([...groupByEvidence(hits, (hit) => hit.text).values()]).toEqual([hits]);
  });
});

type EvidenceOccurrence = Pick<DiscoverSegment, "chatId" | "chatTitle" | "snippet"> & {
  readonly source: ReturnType<typeof corpusSceneSource>;
  readonly rank: number;
};

describe("groupByEvidence source occurrences", () => {
  const chatA = mintTypeId(ID_PREFIX.chat);
  const chatB = mintTypeId(ID_PREFIX.chat);
  const chatC = mintTypeId(ID_PREFIX.chat);
  const occurrence = (chatId: ChatId, chatTitle: string | null, snippet: string, rank: number): EvidenceOccurrence => ({
    chatId,
    chatTitle,
    snippet,
    source: corpusSceneSource(chatId, rank),
    rank,
  });

  test("repeated prose keeps each room's complete source and server rank", () => {
    const first = occurrence(chatA, "Harbour", "the rain came sideways", 1);
    const second = occurrence(chatB, "Harbour (2)", "the rain came sideways", 2);
    const third = occurrence(chatC, "Market", "she counted the coins twice", 3);
    const passages = groupByEvidence([first, second, third], (hit) => snippetForDisplay(hit.snippet));
    expect([...passages.keys()]).toEqual(["the rain came sideways", "she counted the coins twice"]);
    expect(passages.get("the rain came sideways")).toEqual([first, second]);
    expect(passages.get("she counted the coins twice")).toEqual([third]);
  });

  test("two matching occurrences in one room remain separate transcript destinations", () => {
    const first = occurrence(chatA, "Harbour", "the same passage", 1);
    const second = occurrence(chatA, "Harbour", "the same passage", 2);
    expect([...groupByEvidence([first, second], (hit) => hit.snippet).values()]).toEqual([[first, second]]);
    expect(first.source.rowId).not.toBe(second.source.rowId);
  });

  test("display-equivalent slices group together without truncating retained evidence", () => {
    const long = `${"the harvest is in and the evening is quiet ".repeat(20)}finally`;
    const first = occurrence(chatA, "One", long, 1);
    const second = occurrence(chatB, "Two", `${long} and then some more`, 2);
    const passages = groupByEvidence([first, second], (hit) => snippetForDisplay(hit.snippet));
    expect([...passages.keys()]).toEqual([snippetForDisplay(long)]);
    expect([...passages.values()]).toEqual([[first, second]]);
  });

  test("different passages retain their own room associations instead of sharing a destination", () => {
    const first = occurrence(chatB, "Two", "first passage", 1);
    const second = occurrence(chatA, "One", "second passage", 2);
    const third = occurrence(chatA, "One", "first passage", 3);
    const passages = groupByEvidence([first, second, third], (hit) => hit.snippet);
    expect([...passages.values()]).toEqual([[first, third], [second]]);
  });
});

describe("roomNumberingHint (P3-6)", () => {
  test("a numbered room title explains its number; an ordinary one gets no tooltip at all", () => {
    expect(roomNumberingHint("Lena Jan 28 (2)")).toContain("numbered");
    expect(roomNumberingHint("Lena Jan 28 (2)")).toContain("Lena Jan 28 (2)");
    expect(roomNumberingHint("Lena Jan 28")).toBeUndefined();
    // Not a suffix, not a hint: the parenthetical has to END the title, the way the importer writes it.
    expect(roomNumberingHint("Lena (2) and the harbour")).toBeUndefined();
  });
});
