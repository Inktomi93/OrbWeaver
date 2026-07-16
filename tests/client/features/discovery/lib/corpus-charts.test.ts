// Unit: the corpus chart-adoption view-models (features/discovery/lib/corpus-charts). Pure, no DOM — the
// count→BarList adapter (unique keys even on repeated labels) and the semantic-map genre grouping (points
// bucketed into <Scatter> series by top-N frequency, deterministic tie-break, an "Other" catch-all for the
// overflow + null). The surfaces lean on both; this asserts the shaping, not a trivial passthrough.

import { toBarItems, toGenreSeries } from "../../../../../packages/client/src/features/discovery/lib/corpus-charts";
import { expect, test } from "../../../../support/fixtures";

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

test("toGenreSeries caps named series to the ramp length and pools the overflow + null into Other", () => {
  const series = toGenreSeries([point("a", "g0"), point("b", "g1"), point("c", "g2"), point("d", "g3"), point("e", "g4"), point("f", "g5"), point("g", null)]);
  // Five named genre series (the ramp length) + one "Other" pooling the 6th genre and the null point.
  expect(series.map((s) => s.name)).toEqual(["g0", "g1", "g2", "g3", "g4", "Other"]);
  expect(series[5]?.points.map((p) => p.id)).toEqual(["f", "g"]);
});

test("toGenreSeries yields a single Other series when every point is genre-less", () => {
  const series = toGenreSeries([point("a", null), point("b", ""), point("c", null)]);
  expect(series.map((s) => s.name)).toEqual(["Other"]);
  expect(series[0]?.points.map((p) => p.id)).toEqual(["a", "b", "c"]);
});
