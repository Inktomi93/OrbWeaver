// Unit: <Histogram>'s pure `buildHistogramOption` builder. A mounted ECharts instance does not
// survive the Playwright component-test RPC boundary
// with its methods intact, so the resolved-color/flush-bar/bucket-order wiring is proven here as
// plain data (histogram.ct.tsx covers what IS DOM-observable: heading, chart mount, empty state).
//
// §11.3: the builder takes CONCRETE resolved colors (never `TOKENS[...].value`) — <Histogram>
// resolves the DTCG tokens to live computed values via `useChartTheme` and passes them in, because
// ECharts' canvas can't resolve `var()`. This test pins the pass-through with a fixture palette.
import type { ChartColors } from "../../../../packages/ui/src/charts/chart/use-chart-theme.ts";
import { buildHistogramOption } from "../../../../packages/ui/src/charts/histogram/option.ts";
import { expect, test } from "../../../support/fixtures.ts";

const BUCKETS = [
  { label: "0–99", count: 12 },
  { label: "100–199", count: 40 },
  { label: "200–299", count: 7 },
];

// Sentinel resolved palette — distinct per role so a mis-wired slot is caught. Stands in for what
// `useChartTheme` resolves off the live root at render time.
const COLORS: ChartColors = {
  series: "rgb(1, 2, 3)",
  axisLabel: "rgb(4, 5, 6)",
  axisLabelMuted: "rgb(7, 8, 9)",
  axisLine: "rgb(10, 11, 12)",
  palette: ["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)", "rgb(5, 5, 5)"],
};

test("bars carry the resolved series color and sit flush (barCategoryGap: 0%)", () => {
  const option = buildHistogramOption(BUCKETS, COLORS);
  const series = option.series as { itemStyle: { color: string }; barCategoryGap: string }[];
  expect(series[0]?.itemStyle.color).toBe(COLORS.series);
  expect(series[0]?.barCategoryGap).toBe("0%");
});

test("axis chrome carries the resolved line + muted-label colors, never a token literal", () => {
  const option = buildHistogramOption(BUCKETS, COLORS);
  const xAxis = option.xAxis as {
    axisLine: { lineStyle: { color: string } };
    axisLabel: { color: string };
  };
  const yAxis = option.yAxis as {
    splitLine: { lineStyle: { color: string } };
    axisLabel: { color: string };
  };
  expect(xAxis.axisLine.lineStyle.color).toBe(COLORS.axisLine);
  expect(xAxis.axisLabel.color).toBe(COLORS.axisLabelMuted);
  expect(yAxis.splitLine.lineStyle.color).toBe(COLORS.axisLine);
  expect(yAxis.axisLabel.color).toBe(COLORS.axisLabelMuted);
});

test("bucket order becomes the x-axis category order", () => {
  const option = buildHistogramOption(BUCKETS, COLORS);
  const xAxis = option.xAxis as { data: string[] };
  expect(xAxis.data).toEqual(["0–99", "100–199", "200–299"]);
});

test("bucket counts become the series data, in the same order", () => {
  const option = buildHistogramOption(BUCKETS, COLORS);
  const series = option.series as { data: number[] }[];
  expect(series[0]?.data).toEqual([12, 40, 7]);
});
