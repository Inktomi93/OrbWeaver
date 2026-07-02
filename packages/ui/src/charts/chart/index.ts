/**
 * `@orb/ui/chart` — the ECharts seal (D52). `<Chart>` is the ONE wrapper every chart type renders
 * through (reduced-motion, resize, accessible-name obligations live here — see chart.tsx). The
 * `OrbChartOption` type is the shared option surface (bar/line series + grid/tooltip/dataset/aria).
 */

export type { ChartProps } from "./chart";
export { Chart } from "./chart";
export type { OrbChartOption, OrbEChartsInstance } from "./echarts-setup";
