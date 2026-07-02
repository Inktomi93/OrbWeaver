// Unit: <StatFigure>'s pure `buildSparklineOption` builder (ui-package-design §9 v1 corpus-viz
// set). A mounted ECharts instance does not survive the Playwright component-test RPC boundary
// with its methods intact, so the TOKENS-color wiring is proven here as plain data
// (stat-figure.ct.tsx covers what IS DOM-observable: the number/delta tile + sparkline mount).
import { buildSparklineOption } from "../../../../packages/ui/src/charts/stat-figure/option.ts";
import { TOKENS } from "../../../../packages/ui/src/tokens/index.ts";
import { expect, test } from "../../../support/fixtures";

test("the sparkline line and area use the chart-1 TOKENS color, never a raw literal", () => {
  const option = buildSparklineOption([1, 4, 2, 8, 5, 9]);
  const series = option.series as { lineStyle: { color: string }; areaStyle: { color: string } }[];
  expect(series[0]?.lineStyle.color).toBe(TOKENS["color.chart-1"].value);
  expect(series[0]?.areaStyle.color).toBe(TOKENS["color.chart-1"].value);
});

test("the trend values pass through as the series data, in order", () => {
  const option = buildSparklineOption([1, 4, 2, 8, 5, 9]);
  const series = option.series as { data: number[] }[];
  expect(series[0]?.data).toEqual([1, 4, 2, 8, 5, 9]);
});
