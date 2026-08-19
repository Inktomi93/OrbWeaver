// Unit: the corpus chart-adoption view-models (features/discovery/lib/corpus-charts). Pure, no DOM — the
// count→BarList adapter (unique keys even on repeated labels) and the semantic-map genre grouping (points
// bucketed into <Scatter> series by top-N frequency, deterministic tie-break, an "Other" catch-all for the
// overflow + null) — plus the cluster-label disambiguator, which is the one thing on this surface standing
// between a repeated k-means label and three bars a reader (or a screen reader) cannot tell apart. The
// surfaces lean on all three; this asserts the shaping, not a trivial passthrough.

import { disambiguateLabels, toBarItems, toGenreSeries } from "../../../../../packages/client/src/features/discovery/lib/corpus-charts.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function point(id: string, genre: string | null): { id: string; label: string; x: number; y: number; genre: string | null } {
  return { id, label: id, x: 0, y: 0, genre };
}

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

test("toGenreSeries buckets points into named series, frequency-descending", () => {
  const series = toGenreSeries([point("1", "a"), point("2", "b"), point("3", "a"), point("4", "c"), point("5", "a"), point("6", "b")]);
  // a(3) > b(2) > c(1) — series order is frequency-descending; each carries its members' ids.
  expect(series.map((s) => s.name)).toEqual(["a", "b", "c"]);
  expect(series[0]?.points.map((p) => p.id)).toEqual(["1", "3", "5"]);
  expect(series[1]?.points.map((p) => p.id)).toEqual(["2", "6"]);
});

test("toGenreSeries caps the TOTAL series count at the ramp length — Other included", () => {
  const series = toGenreSeries([point("a", "g0"), point("b", "g1"), point("c", "g2"), point("d", "g3"), point("e", "g4"), point("f", "g5"), point("g", null)]);
  // FOUR named + "Other" = five, the chart ramp's length. The cap used to be five NAMED, which made six
  // series, and `buildScatterOption`'s `palette[i % 5]` wrapped "Other" onto g0's exact colour — invisible
  // until the map got a genre key, at which point two rows would have carried the same swatch (B5).
  expect(series.map((s) => s.name)).toEqual(["g0", "g1", "g2", "g3", "Other"]);
  expect(series).toHaveLength(5);
  // The pool takes everything past the cap plus the genre-less point.
  expect(series[4]?.points.map((p) => p.id)).toEqual(["e", "f", "g"]);
});

test("disambiguateLabels leaves unique labels alone", () => {
  const names = disambiguateLabels([
    { label: "brooding rogues", facets: ["dark"] },
    { label: "sunny slice-of-life", facets: ["warm"] },
  ]);
  expect(names).toEqual(["brooding rogues", "sunny slice-of-life"]);
});

test("disambiguateLabels separates a repeated label by its first UNSHARED facet", () => {
  // The live shape (B6): seven of ten bars named "melancholic slice-of-life", over clusters that genuinely
  // differ. "watercolor" is shared, so it cannot be the distinguisher for either of the first two.
  const names = disambiguateLabels([
    { label: "melancholic slice-of-life", facets: ["watercolor", "muted"] },
    { label: "melancholic slice-of-life", facets: ["watercolor", "neon"] },
    { label: "brooding rogues", facets: ["ink"] },
  ]);
  expect(names).toEqual(["melancholic slice-of-life · muted", "melancholic slice-of-life · neon", "brooding rogues"]);
});

test("disambiguateLabels falls back to an ordinal when the facets are identical too", () => {
  const names = disambiguateLabels([
    { label: "mixed", facets: ["watercolor"] },
    { label: "mixed", facets: ["watercolor"] },
    { label: "mixed", facets: [] },
  ]);
  // Nothing in the data distinguishes them, so the name says "different group, nothing better to call it"
  // rather than announcing the same thing three times.
  expect(names).toEqual(["mixed (1 of 3)", "mixed (2 of 3)", "mixed (3 of 3)"]);
});

test("toGenreSeries yields a single Other series when every point is genre-less", () => {
  const series = toGenreSeries([point("a", null), point("b", ""), point("c", null)]);
  expect(series.map((s) => s.name)).toEqual(["Other"]);
  expect(series[0]?.points.map((p) => p.id)).toEqual(["a", "b", "c"]);
});
