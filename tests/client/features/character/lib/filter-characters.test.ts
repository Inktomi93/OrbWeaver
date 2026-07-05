// Unit: `filterCharacters` (features/character/lib/filter-characters) — the pure name/tag search
// predicate the library surface's `useDeferredValue` search box feeds.

import { filterCharacters } from "../../../../../packages/client/src/features/character/lib/filter-characters";
import { expect, test } from "../../../../support/fixtures";

const ARIA = { name: "Aria Nightshade", tags: [{ name: "rpg" }, { name: "fantasy" }] };
const BOLT = { name: "Bolt", tags: [{ name: "sci-fi" }] };
const MARINA = { name: "Marina", tags: [] };

test("an empty query returns every item, unfiltered", () => {
  expect(filterCharacters([ARIA, BOLT, MARINA], "")).toEqual([ARIA, BOLT, MARINA]);
});

test("a whitespace-only query is treated as empty", () => {
  expect(filterCharacters([ARIA, BOLT], "   ")).toEqual([ARIA, BOLT]);
});

test("matches a case-insensitive substring of the name", () => {
  expect(filterCharacters([ARIA, BOLT, MARINA], "ari")).toEqual([ARIA, MARINA]);
});

test("matches a case-insensitive substring of a tag name", () => {
  expect(filterCharacters([ARIA, BOLT, MARINA], "SCI-FI")).toEqual([BOLT]);
});

test("no match returns an empty array", () => {
  expect(filterCharacters([ARIA, BOLT, MARINA], "nonexistent")).toEqual([]);
});
