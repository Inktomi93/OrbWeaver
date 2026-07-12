// The pure ECharts option builder behind <Histogram> — split out (no React/echarts-for-react
// import) so it's cheaply unit-testable: a mounted ECharts instance does not survive the
// Playwright component-test RPC boundary with its methods intact, so the color/flush-bar/
// bucket-order wiring is proven on this plain function instead (option.test.ts).
//
// Chrome colors arrive as CONCRETE resolved values (`ChartColors`), NOT `var()`/`TOKENS[...].value`
// literals — ECharts paints to Canvas where `var(--token)` can't resolve, so <Histogram> resolves
// the DTCG tokens live via `useChartTheme` (§11.3) and passes them in; this builder never touches
// tokens.
import type { OrbChartOption } from "../chart/echarts-setup";
import type { ChartColors } from "../chart/use-chart-theme";

// Defined here (not in histogram.tsx) so this module has no dependency back on the component file
// — histogram.tsx re-exports it for the public API, avoiding a histogram.tsx ↔ option.ts cycle
// (dependency-cruiser no-circular fires on type-only cycles too).
export interface HistogramBucket {
  /** Pre-formatted range label (e.g. "0–99") — no Intl/number logic in ui. */
  readonly label: string;
  readonly count: number;
}

export function buildHistogramOption(
  buckets: readonly HistogramBucket[],
  colors: ChartColors,
): OrbChartOption {
  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis" },
    xAxis: {
      type: "category",
      data: buckets.map((bucket) => bucket.label),
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: colors.axisLabelMuted },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: colors.axisLine } },
      axisLabel: { color: colors.axisLabelMuted },
    },
    series: [
      {
        type: "bar",
        data: buckets.map((bucket) => bucket.count),
        barCategoryGap: "0%",
        itemStyle: { color: colors.series },
      },
    ],
  };
}
