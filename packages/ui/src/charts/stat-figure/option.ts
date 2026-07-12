// The pure ECharts option builder behind <StatFigure>'s sparkline — split out (no React/
// echarts-for-react import) so it's cheaply unit-testable: a mounted ECharts instance does not
// survive the Playwright component-test RPC boundary with its methods intact, so the
// color wiring is proven on this plain function instead (option.test.ts).
//
// The sparkline IS a live canvas chart when `trend` is present — the line + area color arrives as a
// CONCRETE resolved value (`ChartColors.series`), NOT a `var()`/`TOKENS[...].value` literal, because
// ECharts paints to Canvas where `var(--token)` can't resolve. <StatFigure> resolves the DTCG token
// live via `useChartTheme` (§11.3) and passes it in; this builder never touches tokens. (The bare
// number+delta tile mounts no chart, so it never reaches here.)
import type { OrbChartOption } from "../chart/echarts-setup";
import type { ChartColors } from "../chart/use-chart-theme";

const SPARKLINE_LINE_WIDTH = 2;
const SPARKLINE_AREA_OPACITY = 0.12;

export function buildSparklineOption(
  trend: readonly number[],
  colors: ChartColors,
): OrbChartOption {
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
        lineStyle: { color: colors.series, width: SPARKLINE_LINE_WIDTH },
        areaStyle: { color: colors.series, opacity: SPARKLINE_AREA_OPACITY },
      },
    ],
  };
}
