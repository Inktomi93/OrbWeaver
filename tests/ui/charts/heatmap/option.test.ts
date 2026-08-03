// Unit: <Heatmap>'s pure `buildHeatmapOption` builder. A mounted ECharts instance does not survive the
// Playwright component-test RPC boundary with its methods intact, so the resolved-color / VisualMap
// gradient / cell-encoding wiring is proven here as plain data (heatmap.ct.tsx covers what IS
// DOM-observable: heading, canvas mount, empty state).
//
// §11.3: the builder takes CONCRETE resolved colors (never `TOKENS[...].value`) — <Heatmap> resolves the
// DTCG tokens live via `useChartTheme` and passes them in, because ECharts' canvas can't resolve `var()`.
import type { ChartColors } from "../../../../packages/ui/src/charts/chart/use-chart-theme.ts";
import { buildHeatmapOption } from "../../../../packages/ui/src/charts/heatmap/option.ts";
import { expect, test } from "../../../support/fixtures.ts";

const COLORS: ChartColors = {
  series: "rgb(1, 2, 3)",
  axisLabel: "rgb(4, 5, 6)",
  axisLabelMuted: "rgb(7, 8, 9)",
  axisLine: "rgb(10, 11, 12)",
  palette: ["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)", "rgb(5, 5, 5)"],
};

const MATRIX = {
  rows: ["Sun", "Mon"],
  cols: ["00", "01"],
  values: [
    [0, 3],
    [5, 2],
  ],
};

test("cells encode [colIndex, rowIndex, value]; a ragged cell reads as 0", () => {
  const option = buildHeatmapOption({ rows: ["a", "b"], cols: ["x", "y"], values: [[7]] }, COLORS);
  const series = option.series as { data: number[][] }[];
  // Row 0 col 0 = 7 (present), col 1 = 0 (missing), whole of row 1 = 0 (missing row).
  expect(series[0]?.data).toContainEqual([0, 0, 7]);
  expect(series[0]?.data).toContainEqual([1, 0, 0]);
  expect(series[0]?.data).toContainEqual([0, 1, 0]);
  expect(series[0]?.data).toHaveLength(4);
});

test("the VisualMap gradient runs axisLine → series and its max tracks the peak cell", () => {
  const option = buildHeatmapOption(MATRIX, COLORS);
  const visualMap = option.visualMap as { min: number; max: number; inRange: { color: string[] } };
  expect(visualMap.min).toBe(0);
  expect(visualMap.max).toBe(5);
  expect(visualMap.inRange.color).toEqual([COLORS.axisLine, COLORS.series]);
});

test("an all-zero matrix still yields a max of at least 1 (a paintable VisualMap range)", () => {
  const option = buildHeatmapOption({ rows: ["a"], cols: ["x"], values: [[0]] }, COLORS);
  const visualMap = option.visualMap as { max: number };
  expect(visualMap.max).toBe(1);
});

test("row 0 stays at the top — the category y-axis is inverted", () => {
  const option = buildHeatmapOption(MATRIX, COLORS);
  const yAxis = option.yAxis as { data: string[]; inverse: boolean };
  expect(yAxis.data).toEqual(["Sun", "Mon"]);
  expect(yAxis.inverse).toBe(true);
});
