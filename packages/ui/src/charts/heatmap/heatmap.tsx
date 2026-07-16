// A true matrix heatmap over the ECharts seal — a `rows × cols` grid of count-shaded cells with a
// VisualMap legend/gradient. Built for the Analytics 7×24 activity matrix, which was previously
// decomposed into histogram + bar-list because no heatmap primitive existed (north-star §6.4). The
// gradient rides `useChartTheme` tokens, so a custom theme retints every cell.
import type { ReactElement } from "react";
import type { OrbEChartsInstance } from "../chart";
import { Chart } from "../chart";
import { useChartTheme } from "../chart/use-chart-theme";
import { LabeledChartFrame } from "../labeled-chart-frame";
import type { HeatmapMatrix } from "./option";
import { buildHeatmapOption } from "./option";

export type { HeatmapMatrix } from "./option";

const DEFAULT_HEIGHT_PX = 260;

export interface HeatmapProps {
  readonly matrix: HeatmapMatrix;
  /** The chart's accessible name AND its visible heading. */
  readonly label: string;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

export function Heatmap({ matrix, label, height = DEFAULT_HEIGHT_PX, className, onChartReady }: HeatmapProps): ReactElement {
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();
  const isEmpty = matrix.rows.length === 0 || matrix.cols.length === 0;

  return (
    <LabeledChartFrame className={className} isEmpty={isEmpty} label={label} slot="heatmap">
      {isEmpty ? null : <Chart height={height} label={label} onChartReady={onChartReady} option={buildHeatmapOption(matrix, colors)} />}
    </LabeledChartFrame>
  );
}
