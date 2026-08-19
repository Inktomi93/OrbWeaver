// Pure ECharts option builder behind <Histogram> — split out (no React/echarts-for-react import) so
// it's cheaply unit-testable. Chrome colors arrive as concrete resolved values, never var() literals.
import type { OrbChartOption } from "../chart/echarts-setup.ts";
import { AXIS_LABEL_OUTER_BOUNDS } from "../chart/echarts-setup.ts";
import { CHART_LABEL_FONT_FAMILY, CHART_LABEL_FONT_SIZE_PX } from "../chart/label-metrics.ts";
import type { ChartColors } from "../chart/use-chart-theme.ts";

export interface HistogramBucket {
  /** Pre-formatted range label (e.g. "0–99") — no Intl/number logic in ui. */
  readonly label: string;
  readonly count: number;
}

export function buildHistogramOption(buckets: readonly HistogramBucket[], colors: ChartColors, countFormatter: (count: number) => string): OrbChartOption {
  return {
    grid: { left: 8, right: 8, top: 8, bottom: 8, ...AXIS_LABEL_OUTER_BOUNDS },
    tooltip: { trigger: "axis", valueFormatter: (value) => countFormatter(Number(value)) },
    xAxis: {
      type: "category",
      data: buckets.map((bucket) => bucket.label),
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: colors.axisLabelMuted, fontFamily: CHART_LABEL_FONT_FAMILY, fontSize: CHART_LABEL_FONT_SIZE_PX },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: colors.axisLine } },
      // The SAME voice as every figure beside it: a raw `1200000` on this axis next to "1.2M" everywhere
      // else made one surface speak two number vocabularies (side-eye ANALYTICS 2026-08-19, P2f).
      axisLabel: {
        color: colors.axisLabelMuted,
        fontFamily: CHART_LABEL_FONT_FAMILY,
        fontSize: CHART_LABEL_FONT_SIZE_PX,
        formatter: (value: number) => countFormatter(value),
      },
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
