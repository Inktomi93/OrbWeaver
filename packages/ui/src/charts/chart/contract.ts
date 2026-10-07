import type { OrbChartOption, OrbEChartsInstance } from "./echarts-setup.ts";

/** The ECharts event fields exposed by the shared chart seal. */
export interface ChartEvent {
  readonly seriesIndex?: number;
  readonly dataIndex?: number;
  readonly data?: unknown;
}

/** The shared chart inputs, independent of the lazy renderer. */
export interface ChartProps {
  readonly option: OrbChartOption;
  readonly label: string;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
  readonly onEvents?: Readonly<Record<string, (event: ChartEvent) => void>> | undefined;
}
