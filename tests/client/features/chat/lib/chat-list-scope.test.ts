// Unit: the chats-pane scope math. Two things no rendered test states as cheaply — the month bound's YEAR
// ROLLOVER (December is the one selection whose exclusive ceiling leaves the selected year, while its
// printed label must not), and the scope key's ALIASING (two different scopes may never produce one key,
// or the virtual list skips the reset and leaves a deep-scrolled reader mid-scope).

import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import {
  activeFilterExits,
  chatListScopeKey,
  formatMonthLabel,
  monthEmptyDescription,
  monthExclusiveUpperBound,
  phoneFiltersLabel,
  searchEmptyDescription,
} from "../../../../../packages/client/src/features/chat/lib/chat-list-scope.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ARIA = castId<CharacterId>("char_aria");
const SERA = castId<CharacterId>("char_sera");
const UNSCOPED = { beforeRecencyAt: null, characterId: null, search: "" };

test("the month bound is the first UTC instant of the FOLLOWING month, rolling December into January", () => {
  expect(monthExclusiveUpperBound("2020-06")).toBe(Date.UTC(2020, 6, 1));
  expect(monthExclusiveUpperBound("2020-12")).toBe(Date.UTC(2021, 0, 1));
  expect(monthExclusiveUpperBound("2020-01")).toBe(Date.UTC(2020, 1, 1));
});

test("the December LABEL stays in the selected year — only the bound crosses it", () => {
  const label = formatMonthLabel("2020-12") ?? "";
  expect(label).toContain("2020");
  expect(label).not.toContain("2021");
});

test("a value the native month control cannot produce yields no bound and no label", () => {
  for (const bad of ["", "2020-13", "2020-00", "2020-6", "20-06", "2020-06-01"]) {
    expect(monthExclusiveUpperBound(bad)).toBeNull();
    expect(formatMonthLabel(bad)).toBeNull();
  }
});

// THE #385 PIN at the unit tier: a key that drops an axis is what left a deep-scrolled reader mid-scope,
// and it fails HERE as a collision — the two scopes that differ only in the dropped axis produce one key.
// Verified against a planted axis-dropping implementation, not assumed.
test("every axis moves the scope key, and no two distinct scopes alias into one", () => {
  const keys = [
    chatListScopeKey(UNSCOPED),
    chatListScopeKey({ ...UNSCOPED, characterId: ARIA }),
    chatListScopeKey({ ...UNSCOPED, characterId: SERA }),
    chatListScopeKey({ ...UNSCOPED, search: "aria" }),
    // The unsearched `""` is not the unscoped `null` — an encoding that drops empties aliases these two.
    chatListScopeKey({ ...UNSCOPED, search: "null" }),
    chatListScopeKey({ ...UNSCOPED, beforeRecencyAt: Date.UTC(2021, 0, 1) }),
    chatListScopeKey({ beforeRecencyAt: Date.UTC(2021, 0, 1), characterId: ARIA, search: "aria" }),
  ];
  expect(new Set(keys).size).toBe(keys.length);
});

// ── #541 THE ZERO-RESULT VOCABULARY: every ACTIVE axis owes a sentence AND a way out ──────────────────────
// The pane's two empty arms each offered exactly one exit, named after the axis the arm was called after —
// so with a search AND a month in force, "Clear search" was the only way out and taking it left the reader
// in a still-empty list under a narrowing nobody had mentioned. The rendered proof is
// `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx`; these are the derivations behind it, where
// the combinatorics are cheap to state exhaustively.
const NO_EXITS = { beforeRecencyAt: null, characterName: null, query: "" };
const CLEARERS = {
  onClearCharacter: (): void => undefined,
  onClearMonth: (): void => undefined,
  onClearSearch: (): void => undefined,
};

test("an exit appears for exactly the axes in force — never for a dormant one", () => {
  expect(activeFilterExits({ ...NO_EXITS, ...CLEARERS }).map((exit) => exit.key)).toEqual([]);
  expect(activeFilterExits({ ...NO_EXITS, ...CLEARERS, query: "cats" }).map((exit) => exit.key)).toEqual(["search"]);
  expect(activeFilterExits({ ...NO_EXITS, ...CLEARERS, beforeRecencyAt: 1 }).map((exit) => exit.key)).toEqual(["month"]);
  expect(activeFilterExits({ ...NO_EXITS, ...CLEARERS, characterName: "Aria" }).map((exit) => exit.key)).toEqual(["character"]);
  // THE DEFECT, PINNED: this pairing used to yield "Clear search" alone.
  expect(activeFilterExits({ ...NO_EXITS, ...CLEARERS, beforeRecencyAt: 1, query: "cats" }).map((exit) => exit.key)).toEqual(["search", "month"]);
  expect(activeFilterExits({ beforeRecencyAt: 1, characterName: "Aria", query: "cats", ...CLEARERS }).map((exit) => exit.key)).toEqual([
    "search",
    "month",
    "character",
  ]);
});

test("each exit clears ITS OWN axis — a mis-wired handler would widen the wrong narrowing", () => {
  const fired: string[] = [];
  const exits = activeFilterExits({
    beforeRecencyAt: 1,
    characterName: "Aria",
    onClearCharacter: (): void => void fired.push("character"),
    onClearMonth: (): void => void fired.push("month"),
    onClearSearch: (): void => void fired.push("search"),
    query: "cats",
  });
  for (const exit of exits) {
    exit.onClear();
  }
  expect(fired).toEqual(["search", "month", "character"]);
});

test("the empty sentences name every axis in force, and only those", () => {
  expect(searchEmptyDescription(null, null, "cats")).toBe('No chat matches "cats".');
  expect(searchEmptyDescription(null, "June 2020", "cats")).toBe('No chat by June 2020 matches "cats".');
  expect(searchEmptyDescription("Aria", "June 2020", "cats")).toBe('No chat with Aria by June 2020 matches "cats".');
  expect(monthEmptyDescription(null, "June 2020")).toBe("No chats found by June 2020.");
  expect(monthEmptyDescription("Aria", "June 2020")).toBe("No chats with Aria found by June 2020.");
  // A month that failed to parse still yields a sentence rather than the raw `YYYY-MM` or an "undefined".
  expect(monthEmptyDescription(null, null)).toBe("No chats found by the selected month.");
});

// #1718 arm A — THE PHONE FILTERS TRIGGER'S FOUR STATES. #1350's principle is that a fold's TRIGGER carries
// every bound in force, so this table IS that principle, made checkable at the tier the string is built in.
// The rendered arm (that the ROW spends this name, and in this order) is pinned in
// `tests/client/features/chat/surfaces/chat-list-surface.ct.tsx`.
test("phoneFiltersLabel names every filter in force — none, one, or both — character first", () => {
  expect(phoneFiltersLabel(null, null)).toBe("Filters");
  expect(phoneFiltersLabel(null, "June 2020")).toBe("Filters: chats up to June 2020");
  expect(phoneFiltersLabel("Aria Nightshade", null)).toBe("Filters: chats with Aria Nightshade");
  expect(phoneFiltersLabel("Aria Nightshade", "June 2020")).toBe("Filters: chats with Aria Nightshade, up to June 2020");
});

// THE ONE-STATE ARMS ARE THE POINT, not padding: a name assembled by concatenating two fixed halves reads
// correctly with BOTH set and lies with one — a stray comma, a dangling "up to", or a group head with a
// colon and nothing after it. Each single-axis arm above is the shape that catches its own half; this pins
// what all three of those failures have in common, which is punctuation the reader would have to parse.
test("phoneFiltersLabel never trails a separator or a dangling preposition", () => {
  for (const name of [phoneFiltersLabel(null, null), phoneFiltersLabel(null, "June 2020"), phoneFiltersLabel("Aria", null)]) {
    expect(name).not.toMatch(/[,:]\s*$/u);
    expect(name).not.toMatch(/\bwith\s*(?:,|$)/u);
    expect(name).not.toMatch(/\bup to\s*(?:,|$)/u);
  }
});
