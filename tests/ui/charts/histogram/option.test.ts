// Unit: <Histogram>'s pure `buildHistogramOption` builder (ui-package-design §9 v1 corpus-viz
// set). A mounted ECharts instance does not survive the Playwright component-test RPC boundary
// with its methods intact, so the TOKENS-color/flush-bar/bucket-order wiring is proven here as
// plain data (histogram.ct.tsx covers what IS DOM-observable: heading, chart mount, empty state).
import { buildHistogramOption } from "../../../../packages/ui/src/charts/histogram/option.ts";
import { TOKENS } from "../../../../packages/ui/src/tokens/index.ts";
import { expect, test } from "../../../support/fixtures";

const BUCKETS = [
  { label: "0–99", count: 12 },
  { label: "100–199", count: 40 },
  { label: "200–299", count: 7 },
];

test("bars use the chart-1 TOKENS color and sit flush (barCategoryGap: 0%)", () => {
  const option = buildHistogramOption(BUCKETS);
  const series = option.series as { itemStyle: { color: string }; barCategoryGap: string }[];
  expect(series[0]?.itemStyle.color).toBe(TOKENS["color.chart-1"].value);
  expect(series[0]?.barCategoryGap).toBe("0%");
});

test("bucket order becomes the x-axis category order", () => {
  const option = buildHistogramOption(BUCKETS);
  const xAxis = option.xAxis as { data: string[] };
  expect(xAxis.data).toEqual(["0–99", "100–199", "200–299"]);
});

test("bucket counts become the series data, in the same order", () => {
  const option = buildHistogramOption(BUCKETS);
  const series = option.series as { data: number[] }[];
  expect(series[0]?.data).toEqual([12, 40, 7]);
});
