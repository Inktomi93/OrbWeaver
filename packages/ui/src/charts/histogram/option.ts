// Pure ECharts option builder behind <Histogram> — split out (no React/echarts-for-react import) so
// it's cheaply unit-testable. Chrome colors arrive as concrete resolved values, never var() literals.
import type { OrbChartOption } from "../chart/echarts-setup.ts";
import type { ChartColors } from "../chart/use-chart-theme.ts";

export interface HistogramBucket {
  /** Pre-formatted range label (e.g. "0–99") — no Intl/number logic in ui. */
  readonly label: string;
  readonly count: number;
}

export function buildHistogramOption(buckets: readonly HistogramBucket[], colors: ChartColors): OrbChartOption {
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
