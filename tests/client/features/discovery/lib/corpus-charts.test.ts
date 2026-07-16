// Unit: the corpus chart-adoption view-models (features/discovery/lib/corpus-charts). Pure, no DOM — the
// count→BarList adapter (unique keys even on repeated labels) and the semantic-map genre palette (top-N
// by frequency, deterministic tie-break, muted fallback for overflow + null). The surfaces lean on both;
// this asserts the shaping, not a trivial passthrough.

import { assignGenreColors, GENRE_FILL_MUTED, GENRE_FILLS, toBarItems } from "../../../../../packages/client/src/features/discovery/lib/corpus-charts";
import { expect, test } from "../../../../support/fixtures";

test("toBarItems maps label/value and keeps keys unique across repeated labels", () => {
  const rows = [
    { name: "fantasy", n: 5 },
    { name: "fantasy", n: 3 },
    { name: "noir", n: 1 },
  ];
  const items = toBarItems(
    rows,
    (r) => r.name,
    (r) => r.n,
  );
  expect(items.map((i) => i.label)).toEqual(["fantasy", "fantasy", "noir"]);
  expect(items.map((i) => i.value)).toEqual([5, 3, 1]);
  // ids are unique even though two labels collide (the map key would otherwise clash).
  expect(new Set(items.map((i) => i.id)).size).toBe(3);
});

test("assignGenreColors ranks the legend by frequency and assigns distinct swatches", () => {
  const palette = assignGenreColors(["a", "b", "a", "c", "a", "b"]);
  // a(3) > b(2) > c(1) — legend is frequency-descending.
  expect(palette.legend.map((s) => s.genre)).toEqual(["a", "b", "c"]);
  expect(palette.fillFor("a")).toBe(GENRE_FILLS[0]);
  expect(palette.fillFor("b")).toBe(GENRE_FILLS[1]);
  expect(palette.fillFor("c")).toBe(GENRE_FILLS[2]);
});

test("assignGenreColors overflows past the swatch count to muted, and null is muted", () => {
  const many = ["g0", "g1", "g2", "g3", "g4", "g5"];
  const palette = assignGenreColors(many);
  // Only GENRE_FILLS.length genres get a legend entry.
  expect(palette.legend).toHaveLength(GENRE_FILLS.length);
  // The overflow genre and null both fall to muted.
  expect(palette.fillFor("g5")).toBe(GENRE_FILL_MUTED);
  expect(palette.fillFor(null)).toBe(GENRE_FILL_MUTED);
});

test("assignGenreColors ignores null/empty when tallying and yields an empty legend for none", () => {
  const palette = assignGenreColors([null, "", null]);
  expect(palette.legend).toEqual([]);
  expect(palette.fillFor("anything")).toBe(GENRE_FILL_MUTED);
});
