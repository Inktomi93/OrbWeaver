// Pure ECharts option builder behind <Heatmap> — split out (no React/echarts-for-react import) so it's
// cheaply unit-testable without a mounted instance. Chrome + the VisualMap gradient arrive as concrete
// resolved values (never `var()`/`TOKENS[...].value`), because ECharts paints to Canvas where `var()`
// can't resolve. The gradient runs `background` → `series` (chart-1), a single-hue sequential ramp that
// retints with a custom theme.
import type { OrbChartOption } from "../chart/echarts-setup.ts";
import { AXIS_LABEL_OUTER_BOUNDS } from "../chart/merge-option.ts";
import type { ChartColors } from "../chart/use-chart-theme.ts";

export interface HeatmapMatrix {
  /** Row (y) category labels, top → bottom. */
  readonly rows: readonly string[];
  /** Column (x) category labels, left → right. */
  readonly cols: readonly string[];
  /** `values[rowIndex][colIndex]` — the cell count; missing cells read as 0. */
  readonly values: readonly (readonly number[])[];
}

const AXIS_LABEL_INTERVAL = 2;

function maxValue(values: readonly (readonly number[])[]): number {
  let max = 0;
  for (const row of values) {
    for (const cell of row) {
      if (cell > max) {
        max = cell;
      }
    }
  }
  return max;
}

export function buildHeatmapOption(matrix: HeatmapMatrix, colors: ChartColors): OrbChartOption {
  // ECharts heatmap data is `[colIndex, rowIndex, value]`; rows render bottom-up, so invert the y-axis
  // (below) to keep row 0 at the top, matching the caller's `rows` order.
  const data = matrix.rows.flatMap((_row, rowIndex) => matrix.cols.map((_col, colIndex) => [colIndex, rowIndex, matrix.values[rowIndex]?.[colIndex] ?? 0]));

  const legendBlock = colors.metrics.barHeight + colors.metrics.lineHeight + 2 * colors.metrics.padding;

  return {
    grid: {
      left: colors.metrics.padding,
      right: colors.metrics.padding,
      top: colors.metrics.padding,
      // The calculable legend paints handle labels outside its gradient; the hour axis needs its own text band.
      bottom: legendBlock + colors.metrics.lineHeight + colors.metrics.padding,
      ...AXIS_LABEL_OUTER_BOUNDS,
    },
    tooltip: { trigger: "item" },
    xAxis: {
      type: "category",
      data: [...matrix.cols],
      splitArea: { show: true },
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: colors.axisLabelMuted, interval: AXIS_LABEL_INTERVAL },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: [...matrix.rows],
      splitArea: { show: true },
      axisLine: { lineStyle: { color: colors.axisLine } },
      axisTick: { show: false },
      axisLabel: { color: colors.axisLabel },
    },
    visualMap: {
      min: 0,
      max: Math.max(1, maxValue(matrix.values)),
      calculable: true,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      itemWidth: colors.metrics.barHeight,
      handleSize: colors.metrics.barHeight,
      padding: colors.metrics.padding,
      textGap: colors.metrics.tight,
      textStyle: { color: colors.axisLabelMuted, fontSize: colors.metrics.fontSize, lineHeight: colors.metrics.lineHeight },
      inRange: { color: [colors.axisLine, colors.series] },
    },
    series: [
      {
        type: "heatmap",
        data,
        itemStyle: { borderColor: colors.axisLine, borderWidth: colors.metrics.stroke },
      },
    ],
  };
}
