// Unit: the corpus chart-adoption view-models (features/discovery/lib/corpus-charts). Pure, no DOM — the
// count→BarList adapter (unique keys even on repeated labels) and the semantic-map genre grouping (points
// bucketed into <Scatter> series by top-N frequency, deterministic tie-break, an "Other" catch-all for the
// overflow + null) — plus the cluster-label disambiguator, which is the one thing on this surface standing
// between a repeated k-means label and three bars a reader (or a screen reader) cannot tell apart. The
// surfaces lean on all three; this asserts the shaping, not a trivial passthrough.

import {
  chartLabelWithDenominator,
  chartSpread,
  disambiguateLabels,
  toBarItems,
  toGenreSeries,
  topRanked,
} from "../../../../../packages/client/src/features/discovery/lib/corpus-charts.ts";
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

// ── THE CAP AND ITS DENOMINATOR (side-eye populated arm 2026-08-23, [P2-3] / [P1-1]) ──────────────────
// Two charts on the corpus overview drew their WHOLE series: 50 keyword bars in a 1,616px canvas (45% of
// the page, 30.08% accent against a 10% cap, over values running 6 down to 2), and a route table whose
// only guard was whether money had moved. Both fixes are the same pair — a ranked head, and a stated
// total — so both live in one helper and are pinned here rather than in each caller.

test("topRanked SORTS before slicing — the server's order is not the charted quantity", () => {
  // `toBarItems` treats array order as the rank and does not sort, so a caller handing it a browsing order
  // is exactly the rank-vs-display defect [P2-2] names. `modelRouting` really does arrive genre-major.
  const routes = [
    { route: "drama → a", generations: 10 },
    { route: "fantasy → b", generations: 400 },
    { route: "fantasy → c", generations: 90 },
  ];
  const top = topRanked(routes, (r) => r.generations, 2);
  expect(top.rows.map((r) => r.route)).toEqual(["fantasy → b", "fantasy → c"]);
  expect(top.total, "the denominator is the WHOLE series, not the slice").toBe(3);
});

test("topRanked keeps input order on ties, so one corpus charts identically twice", () => {
  const rows = [
    { id: "a", n: 5 },
    { id: "b", n: 5 },
    { id: "c", n: 5 },
  ];
  expect(topRanked(rows, (r) => r.n, 3).rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
});

test("topRanked is a no-op slice when the series is already under the cap", () => {
  const rows = [{ n: 2 }, { n: 9 }];
  const top = topRanked(rows, (r) => r.n, 12);
  expect(top.rows.map((r) => r.n)).toEqual([9, 2]);
  expect(top.total).toBe(2);
});

test("chartLabelWithDenominator states the truncation, and says nothing when nothing was cut", () => {
  // A capped chart that does not name its total is the never-played defect in another section's clothing:
  // the reader takes the window for the whole.
  expect(chartLabelWithDenominator("Top keywords", 12, 50, "keywords")).toBe("Top keywords · 12 of 50 keywords");
  expect(chartLabelWithDenominator("Top keywords", 50, 50, "keywords")).toBe("Top keywords");
  // Defensive only in the sense that a caller passing a head LONGER than its total is a bug we must not
  // dress up as a truncation — `>=` is what keeps the honest arm honest.
  expect(chartLabelWithDenominator("Busiest routes", 12, 3, "routes")).toBe("Busiest routes");
});

test("chartSpread states a flat series' range, which is the whole of the N5 ruling", () => {
  // The audited keyword head ran 6 down to 4 — every bar 67-100% of its track. The chart is accurate and
  // reads as broken, so the label carries the ground it covers.
  expect(chartSpread([6, 5, 5, 4], "uses")).toBe("6–4 uses");
  // A genuinely flat series says so in words rather than printing "4–4".
  expect(chartSpread([4, 4, 4], "uses")).toBe("4 uses each");
  // No rows means no chart; the caller never renders one, and the clause has nothing to state.
  expect(chartSpread([], "uses")).toBe("");
  // Order-independent: it is a property of the series, not of the sort the caller happened to apply.
  expect(chartSpread([2, 90, 30], "generations")).toBe("90–2 generations");
});
