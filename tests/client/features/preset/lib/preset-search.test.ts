// Unit: the preset library's SEARCH predicate (features/preset/lib/preset-search) — the ONE derivation both
// readers of the lens share (the shell chrome band's census and the rows themselves). It is a lib test
// rather than a rendered one precisely because the extraction's whole point is that the answer does not
// depend on which component asks; the two readers AGREEING is pinned at the surface CT.

import { filterPresetsByName, presetSearchNeedle } from "../../../../../packages/client/src/features/preset/lib/preset-search.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ROWS = [{ name: "Default" }, { name: "Default (edited)" }, { name: "Imported RP" }];

// The rest state has to survive a stray space: someone who taps space in an empty box has not started
// searching, and treating " " as a needle would hide every row whose name carries no space.
test("a box holding only whitespace is the REST STATE, not a search", () => {
  expect(presetSearchNeedle("")).toBe("");
  expect(presetSearchNeedle("   ")).toBe("");
  expect(filterPresetsByName(ROWS, presetSearchNeedle("  "))).toHaveLength(ROWS.length);
});

test("the needle folds case and trims the edges — the box is forgiving about how the words arrive", () => {
  expect(presetSearchNeedle("  Imported  ")).toBe("imported");
});

// A prefix match would report no hits for "rp" and the census would then say 0 for a library that plainly
// contains it — the exact class of disagreement this predicate exists to make impossible.
test("the match is a case-insensitive SUBSTRING, not a prefix", () => {
  expect(filterPresetsByName(ROWS, "rp").map((row) => row.name)).toEqual(["Imported RP"]);
  expect(filterPresetsByName(ROWS, "default").map((row) => row.name)).toEqual(["Default", "Default (edited)"]);
});

test("a needle nothing carries yields the EMPTY list — the no-match arm's own predicate", () => {
  expect(filterPresetsByName(ROWS, "zzzz")).toEqual([]);
});
