// Unit: `filterChats` (features/chat/lib/filter-chats) — the pure title/participant search predicate the
// Chats-LIST surface's `useDeferredValue` search box feeds (UIP-303).

import { filterChats } from "../../../../../packages/client/src/features/chat/lib/filter-chats.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ADVENTURE = { title: "A grand adventure", participantNames: ["Aria Nightshade"], lastMessagePreview: "The court remembers what she did." };
const BLANK = { title: null, participantNames: ["Bolt"], lastMessagePreview: null };
const SOLO = { title: "Solo musings", participantNames: [], lastMessagePreview: "quiet rain on the window" };

test("an empty query returns every item, unfiltered", () => {
  expect(filterChats([ADVENTURE, BLANK, SOLO], "")).toEqual([ADVENTURE, BLANK, SOLO]);
});

test("a whitespace-only query is treated as empty", () => {
  expect(filterChats([ADVENTURE, BLANK], "   ")).toEqual([ADVENTURE, BLANK]);
});

test("matches a case-insensitive substring of the title", () => {
  expect(filterChats([ADVENTURE, BLANK, SOLO], "GRAND")).toEqual([ADVENTURE]);
});

test("matches a case-insensitive substring of a participant name", () => {
  expect(filterChats([ADVENTURE, BLANK, SOLO], "bolt")).toEqual([BLANK]);
});

test("a null-title row can still match on its participants, never on the title", () => {
  // "blank" appears in no title/participant — the null-title row must NOT match a title probe.
  expect(filterChats([BLANK], "blank")).toEqual([]);
});

test("no match returns an empty array", () => {
  expect(filterChats([ADVENTURE, BLANK, SOLO], "nonexistent")).toEqual([]);
});

test("matches a case-insensitive substring of the last-message preview (owner ruling 2026-08-01)", () => {
  expect(filterChats([ADVENTURE, BLANK, SOLO], "COURT REMEMBERS")).toEqual([ADVENTURE]);
});

test("a null preview never matches on the preview arm (only title/participants can)", () => {
  // "null" appears nowhere in BLANK's title/participants; the null preview must not match anything.
  expect(filterChats([BLANK], "rain")).toEqual([]);
});
