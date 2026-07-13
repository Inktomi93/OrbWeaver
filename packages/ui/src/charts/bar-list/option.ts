// Pure ECharts option builder behind <BarList> — split out so it's cheaply unit-testable without a
// mounted ECharts instance. Chrome colors arrive as concrete resolved values, never var() literals.
import type { OrbChartOption } from "../chart/echarts-setup";
import type { ChartColors } from "../chart/use-chart-theme";

export interface BarListItem {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

const BAR_MAX_WIDTH_PX = 20;
const BAR_BORDER_RADIUS_PX = 4;
const BAR_BORDER_RADIUS = [0, BAR_BORDER_RADIUS_PX, BAR_BORDER_RADIUS_PX, 0];
// Fixed gutter reserved for the bar-end value label (containLabel only accounts for axis labels).
const VALUE_LABEL_GUTTER_PX = 64;

export function buildBarListOption(
  items: readonly BarListItem[],
  valueFormatter: (value: number) => string,
  colors: ChartColors,
): OrbChartOption {
  return {
    grid: { left: 8, right: VALUE_LABEL_GUTTER_PX, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "item",
      valueFormatter: (value) => valueFormatter(Number(value)),
    },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      inverse: true,
      data: items.map((item) => item.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: colors.axisLabel },
    },
    series: [
      {
        type: "bar",
        barMaxWidth: BAR_MAX_WIDTH_PX,
        data: items.map((item) => item.value),
        itemStyle: { color: colors.series, borderRadius: BAR_BORDER_RADIUS },
        label: {
          show: true,
          position: "right",
          color: colors.axisLabelMuted,
          formatter: (params) => valueFormatter(Number(params.value)),
        },
      },
    ],
  };
}
