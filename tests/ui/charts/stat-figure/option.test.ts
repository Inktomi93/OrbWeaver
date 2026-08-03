// Unit: <StatFigure>'s pure `buildSparklineOption` builder. A mounted ECharts instance does not
// survive the Playwright component-test RPC boundary
// with its methods intact, so the resolved-color wiring is proven here as plain data
// (stat-figure.ct.tsx covers what IS DOM-observable: the number/delta tile + sparkline mount).
//
// §11.3: the builder takes a CONCRETE resolved color (never `TOKENS[...].value`) — <StatFigure>
// resolves the DTCG token to a live computed value via `useChartTheme` and passes it in, because the
// sparkline is a canvas ECharts line that can't resolve `var()`. This pins the pass-through.
import type { ChartColors } from "../../../../packages/ui/src/charts/chart/use-chart-theme.ts";
import { buildSparklineOption } from "../../../../packages/ui/src/charts/stat-figure/option.ts";
import { expect, test } from "../../../support/fixtures.ts";

const COLORS: ChartColors = {
  series: "rgb(1, 2, 3)",
  axisLabel: "rgb(4, 5, 6)",
  axisLabelMuted: "rgb(7, 8, 9)",
  axisLine: "rgb(10, 11, 12)",
  palette: ["rgb(1, 1, 1)", "rgb(2, 2, 2)", "rgb(3, 3, 3)", "rgb(4, 4, 4)", "rgb(5, 5, 5)"],
};

test("the sparkline line and area carry the resolved series color, never a token literal", () => {
  const option = buildSparklineOption([1, 4, 2, 8, 5, 9], COLORS);
  const series = option.series as { lineStyle: { color: string }; areaStyle: { color: string } }[];
  expect(series[0]?.lineStyle.color).toBe(COLORS.series);
  expect(series[0]?.areaStyle.color).toBe(COLORS.series);
});

test("the trend values pass through as the series data, in order", () => {
  const option = buildSparklineOption([1, 4, 2, 8, 5, 9], COLORS);
  const series = option.series as { data: number[] }[];
  expect(series[0]?.data).toEqual([1, 4, 2, 8, 5, 9]);
});
