// The corpus omnibox's RESULT TEXT rules — the pure half of a search row (the rendered half is
// corpus-search-results.ct.tsx). Each case here is a defect the 2026-08-19 corpus re-pass MEASURED on the
// live surface, reduced to the string decision behind it.

import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  chatSubtitle,
  dedupeByEvidence,
  evidenceScent,
  groupEvidenceByPassage,
  roomNumberingHint,
  sharedRooms,
  snippetForDisplay,
} from "../../../../../packages/client/src/features/discovery/lib/corpus-result-text.ts";
import { expect, test } from "../../../../support/fixtures.ts";

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

const CHAT_A = castId<ChatId>("chat_a");
const CHAT_B = castId<ChatId>("chat_b");
const CHAT_C = castId<ChatId>("chat_c");

describe("groupEvidenceByPassage (P1-1)", () => {
  /** One Scenes segment — the three fields the grouping reads. Branded at the fixture consts, so the
   *  helper's own parameter is the id type the production caller passes, never a bare string. */
  const segment = (chatId: ChatId, chatTitle: string | null, snippet: string): { chatId: ChatId; chatTitle: string | null; snippet: string } => ({
    chatId,
    chatTitle,
    snippet,
  });

  test("one passage found in three rooms is ONE body with three doors — nothing is dropped", () => {
    const passages = groupEvidenceByPassage(
      [
        segment(CHAT_A, "Lena Jan 28", "the rain came sideways"),
        segment(CHAT_B, "Lena Jan 28 (2)", "the rain came sideways"),
        segment(CHAT_C, "Lena Jan 26", "she counted the coins twice"),
      ],
      "Lena",
    );

    expect(passages).toHaveLength(2);
    expect(passages[0]?.snippet).toBe("the rain came sideways");
    expect(passages[0]?.rooms.map((room) => room.title)).toEqual(["Lena Jan 28", "Lena Jan 28 (2)"]);
    expect(passages[1]?.rooms.map((room) => room.title)).toEqual(["Lena Jan 26"]);
  });

  test("one room quoting the same passage twice is ONE door, not two", () => {
    const passages = groupEvidenceByPassage([segment(CHAT_A, "Harbour", "the same block"), segment(CHAT_A, "Harbour", "the same block")], "Lena");
    expect(passages).toHaveLength(1);
    expect(passages[0]?.rooms).toHaveLength(1);
  });

  test("the grouping key is the DISPLAYED text — two wire slices that read identically group together", () => {
    // The wire cuts at 280 chars mid-word; the projection cuts earlier, on a word boundary. Two copies of
    // one block that differ only past the display cut are one passage to the reader, so they are one here.
    const long = `${"the harvest is in and the evening is quiet ".repeat(20)}finally`;
    const passages = groupEvidenceByPassage([segment(CHAT_A, "One", long), segment(CHAT_B, "Two", `${long} and then some more`)], "Lena");
    expect(passages).toHaveLength(1);
    expect(passages[0]?.rooms).toHaveLength(2);
  });

  test("an unnamed room still names itself through the title chain, never an id", () => {
    const passages = groupEvidenceByPassage([segment(CHAT_A, null, "a line")], "Lena");
    expect(passages[0]?.rooms[0]?.title).toBe("Lena");
  });
});

describe("sharedRooms (P3-D)", () => {
  const passage = (snippet: string, ...rooms: readonly ChatId[]): { snippet: string; rooms: { chatId: ChatId; title: string }[] } => ({
    snippet,
    rooms: rooms.map((chatId) => ({ chatId, title: `room ${chatId}` })),
  });

  test("three passages out of ONE room hand the door back, so it can be said once", () => {
    const rooms = sharedRooms([passage("a", CHAT_A), passage("b", CHAT_A), passage("c", CHAT_A)]);
    expect(rooms?.map((room) => room.chatId)).toEqual([CHAT_A]);
  });

  test("passages from DIFFERENT rooms keep their own doors — a hoisted door would lie", () => {
    expect(sharedRooms([passage("a", CHAT_A), passage("b", CHAT_B)])).toBeNull();
    // A superset is not a share: the second passage was never found in CHAT_B.
    expect(sharedRooms([passage("a", CHAT_A, CHAT_B), passage("b", CHAT_A)])).toBeNull();
  });

  test("the shared set is order-insensitive — the same two rooms in either order is one answer", () => {
    expect(sharedRooms([passage("a", CHAT_A, CHAT_B), passage("b", CHAT_B, CHAT_A)])).toHaveLength(2);
  });

  test("a lone passage has nothing to share it with, so the door stays where the evidence is", () => {
    expect(sharedRooms([passage("a", CHAT_A)])).toBeNull();
    expect(sharedRooms([])).toBeNull();
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
