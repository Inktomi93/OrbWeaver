// A distribution chart over pre-binned buckets — binning is the caller's decision, this only renders
// already-bucketed counts. Bars sit flush (barCategoryGap: "0%"), distinguishing it from an ordinary bar chart.
import type { ReactElement } from "react";
import { EmptyState } from "#primitives/empty-state";
import type { OrbEChartsInstance } from "../chart";
import { Chart } from "../chart";
import { useChartTheme } from "../chart/use-chart-theme";
import type { HistogramBucket } from "./option";
import { buildHistogramOption } from "./option";
import { histogramVariants } from "./variants";

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
  const slots = histogramVariants();
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();

  if (buckets.length === 0) {
    return (
      <div className={slots.root({ className })} data-slot="histogram">
        <EmptyState title={label} description="No data yet." />
      </div>
    );
  }

  return (
    <div className={slots.root({ className })} data-slot="histogram">
      <p className={slots.heading()} data-slot="histogram-heading">
        {label}
      </p>
      <Chart height={height} label={label} onChartReady={onChartReady} option={buildHistogramOption(buckets, colors)} />
    </div>
  );
}
