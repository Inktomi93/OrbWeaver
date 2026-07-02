// The pure ECharts option builder behind <StatFigure>'s sparkline — split out (no React/
// echarts-for-react import) so it's cheaply unit-testable: a mounted ECharts instance does not
// survive the Playwright component-test RPC boundary with its methods intact, so the
// TOKENS-color wiring is proven on this plain function instead (option.test.ts).
import { TOKENS } from "#tokens";
import type { OrbChartOption } from "../chart/echarts-setup";

const SPARKLINE_LINE_WIDTH = 2;
const SPARKLINE_AREA_OPACITY = 0.12;

export function buildSparklineOption(trend: readonly number[]): OrbChartOption {
  return {
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: "category", show: false, data: trend.map((_, index) => String(index)) },
    yAxis: { type: "value", show: false, min: "dataMin", max: "dataMax" },
    tooltip: { trigger: "axis" },
    series: [
      {
        type: "line",
        data: [...trend],
        showSymbol: false,
        lineStyle: { color: TOKENS["color.chart-1"].value, width: SPARKLINE_LINE_WIDTH },
        areaStyle: { color: TOKENS["color.chart-1"].value, opacity: SPARKLINE_AREA_OPACITY },
      },
    ],
  };
}
