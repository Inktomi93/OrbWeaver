// A true matrix heatmap over the ECharts seal — a `rows × cols` grid of count-shaded cells with a
// VisualMap legend/gradient. Built for the Analytics 7×24 activity matrix, which was previously
// decomposed into histogram + bar-list because no heatmap primitive existed (north-star §6.4). The
// gradient rides `useChartTheme` tokens, so a custom theme retints every cell.
import type { ReactElement } from "react";
import { matrixTable } from "../chart/data-table.ts";
import type { OrbEChartsInstance } from "../chart/index.ts";
import { Chart } from "../chart/index.ts";
import { useChartTheme } from "../chart/use-chart-theme.ts";
import { LabeledChartFrame } from "../labeled-chart-frame/index.ts";
import type { HeatmapMatrix } from "./option.ts";
import { buildHeatmapOption } from "./option.ts";

export type { HeatmapMatrix } from "./option.ts";

const DEFAULT_HEIGHT_PX = 260;

export interface HeatmapProps {
  readonly matrix: HeatmapMatrix;
  /** The chart's accessible name AND its visible heading. */
  readonly label: string;
  /** Pre-formatted cell display for the text equivalent (no Intl in ui). */
  readonly countFormatter?: (count: number) => string;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

function defaultCountFormatter(count: number): string {
  return String(count);
}

export function Heatmap({
  matrix,
  label,
  countFormatter = defaultCountFormatter,
  height = DEFAULT_HEIGHT_PX,
  className,
  onChartReady,
}: HeatmapProps): ReactElement {
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();
  const isEmpty = matrix.rows.length === 0 || matrix.cols.length === 0;

  return (
    <LabeledChartFrame
      className={className}
      isEmpty={isEmpty}
      label={label}
      slot="heatmap"
      // The 7×24 activity grid is the family's largest reading and the one with no other home at all —
      // a `<table>` is what the picture already IS, so the equivalent is a literal transposition of it.
      table={matrixTable(
        "Row",
        matrix.cols,
        matrix.rows.map((row, rowIndex) => ({
          label: row,
          values: matrix.cols.map((_col, colIndex) => countFormatter(matrix.values[rowIndex]?.[colIndex] ?? 0)),
        })),
      )}
    >
      {isEmpty ? null : <Chart height={height} label={label} onChartReady={onChartReady} option={buildHeatmapOption(matrix, colors)} />}
    </LabeledChartFrame>
  );
}
