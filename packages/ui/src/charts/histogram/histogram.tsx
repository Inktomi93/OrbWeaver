// A distribution chart over pre-binned buckets — binning is the caller's decision, this only renders
// already-bucketed counts. Bars sit flush (barCategoryGap: "0%"), distinguishing it from an ordinary bar chart.
import type { ReactElement } from "react";
import type { OrbEChartsInstance } from "../chart";
import { Chart } from "../chart";
import { useChartTheme } from "../chart/use-chart-theme";
import { LabeledChartFrame } from "../labeled-chart-frame";
import type { HistogramBucket } from "./option";
import { buildHistogramOption } from "./option";

export type { HistogramBucket } from "./option";

export interface HistogramProps {
  /** Pre-binned buckets, in domain order (left to right). */
  readonly buckets: readonly HistogramBucket[];
  readonly label: string;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

const DEFAULT_HEIGHT_PX = 200;

export function Histogram({ buckets, label, height = DEFAULT_HEIGHT_PX, className, onChartReady }: HistogramProps): ReactElement {
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();
  const isEmpty = buckets.length === 0;

  return (
    <LabeledChartFrame className={className} isEmpty={isEmpty} label={label} slot="histogram">
      {isEmpty ? null : <Chart height={height} label={label} onChartReady={onChartReady} option={buildHistogramOption(buckets, colors)} />}
    </LabeledChartFrame>
  );
}
