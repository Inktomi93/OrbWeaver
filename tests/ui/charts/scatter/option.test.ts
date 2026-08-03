// Unit: <Scatter>'s pure `buildScatterOption` builder + `pointId` reader. A mounted ECharts instance
// does not survive the Playwright component-test RPC boundary with its methods intact, so the
// resolved-palette wiring, the per-datum id encoding, and the click→id decode are proven here as plain
// data (scatter.ct.tsx covers what IS DOM-observable: heading, canvas mount, click firing onPointClick).
//
// §11.3: the builder takes CONCRETE resolved colors (never `TOKENS[...].value`) — <Scatter> resolves the
// DTCG ramp to live values via `useChartTheme` and passes them in, because ECharts' canvas can't resolve
// `var()`. This pins the pass-through + palette-by-index contract with a fixture palette.

import type { ChartColors } from "../../../../packages/ui/src/charts/chart/use-chart-theme.ts";
import { buildScatterOption, pointId } from "../../../../packages/ui/src/charts/scatter/option.ts";
import { expect, test } from "../../../support/fixtures.ts";

// Sentinel resolved palette — distinct per stop so a mis-indexed series color is caught.
const COLORS: ChartColors = {
  series: "rgb(0, 0, 0)",
  axisLabel: "rgb(4, 5, 6)",
  axisLabelMuted: "rgb(7, 8, 9)",
  axisLine: "rgb(10, 11, 12)",
  palette: ["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)", "rgb(5, 5, 5)"],
};

const SERIES = [
  { name: "fantasy", points: [{ id: "c1", label: "Alice", x: 1, y: 2 }] },
  { name: "noir", points: [{ id: "c2", label: "Bob", x: 3, y: 4 }] },
];

test("each series takes its palette stop by index; points encode [x, y, id]", () => {
  const option = buildScatterOption(SERIES, COLORS);
  const series = option.series as { itemStyle: { color: string }; data: { name: string; value: [number, number, string] }[] }[];
  expect(series[0]?.itemStyle.color).toBe(COLORS.palette[0]);
  expect(series[1]?.itemStyle.color).toBe(COLORS.palette[1]);
  expect(series[0]?.data[0]?.value).toEqual([1, 2, "c1"]);
  expect(series[0]?.data[0]?.name).toBe("Alice");
});

test("the palette wraps past its length rather than dropping a series color", () => {
  const many = Array.from({ length: 6 }, (_unused, i) => ({ name: `g${i}`, points: [{ id: `x${i}`, label: `L${i}`, x: 0, y: 0 }] }));
  const option = buildScatterOption(many, COLORS);
  const series = option.series as { itemStyle: { color: string } }[];
  // Series 5 (the 6th) wraps back to palette stop 0.
  expect(series[5]?.itemStyle.color).toBe(COLORS.palette[0]);
});

test("pointId reads the opaque id back off a clicked datum, tuple or authored {value} object, else null", () => {
  // The authored datum shape ECharts hands back on a click event (see buildScatterOption).
  expect(pointId({ name: "Alice", value: [1, 2, "c1"] })).toBe("c1");
  // Bare-tuple fallback.
  expect(pointId([1, 2, "c1"])).toBe("c1");
  expect(pointId({ name: "Alice", value: [1, 2] })).toBeNull();
  expect(pointId([1, 2])).toBeNull();
  expect(pointId(undefined)).toBeNull();
  expect(pointId({ x: 1 })).toBeNull();
});
