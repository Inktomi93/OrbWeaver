// The pure ECharts option builder behind <BarList> — split out (no React/echarts-for-react
// import) so it's cheaply unit-testable: a mounted ECharts instance does not survive the
// Playwright component-test RPC boundary with its methods intact, so the color/rank-order/
// formatter wiring is proven on this plain function instead (option.test.ts).
//
// Chrome colors arrive as CONCRETE resolved values (`ChartColors`), NOT `var()`/`TOKENS[...].value`
// literals — ECharts paints to Canvas where `var(--token)` can't resolve, so <BarList> resolves the
// DTCG tokens live via `useChartTheme` (§11.3) and passes them in; this builder never touches tokens.
import type { OrbChartOption } from "../chart/echarts-setup";
import type { ChartColors } from "../chart/use-chart-theme";

// Defined here (not in bar-list.tsx) so this module has no dependency back on the component file
// — bar-list.tsx re-exports it for the public API, avoiding a bar-list.tsx ↔ option.ts cycle
// (dependency-cruiser no-circular fires on type-only cycles too).
export interface BarListItem {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

const BAR_MAX_WIDTH_PX = 20;
const BAR_BORDER_RADIUS_PX = 4;
const BAR_BORDER_RADIUS = [0, BAR_BORDER_RADIUS_PX, BAR_BORDER_RADIUS_PX, 0];
// Fixed gutter reserved for the bar-end value label (containLabel only accounts for axis labels,
// not per-bar data labels) — a v1 simplification; revisit if a consumer needs long value strings.
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
