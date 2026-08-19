// A distribution chart over pre-binned buckets — binning is the caller's decision, this only renders
// already-bucketed counts. Bars sit flush (barCategoryGap: "0%"), distinguishing it from an ordinary bar chart.
import type { ReactElement } from "react";
import { labelledValueTable } from "../chart/data-table.ts";
import type { OrbEChartsInstance } from "../chart/index.ts";
import { Chart } from "../chart/index.ts";
import { useChartTheme } from "../chart/use-chart-theme.ts";
import { LabeledChartFrame } from "../labeled-chart-frame/index.ts";
import type { HistogramBucket } from "./option.ts";
import { buildHistogramOption } from "./option.ts";

export type { HistogramBucket } from "./option.ts";

export interface HistogramProps {
  /** Pre-binned buckets, in domain order (left to right). */
  readonly buckets: readonly HistogramBucket[];
  readonly label: string;
  /** Pre-formatted count display for the value axis, the tooltip and the text equivalent (no Intl in ui).
   *  Pass the SAME formatter the surrounding figures use — a raw `1200000` on this axis beside "1.2M"
   *  everywhere else is two number vocabularies on one screen. */
  readonly countFormatter?: (count: number) => string;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

const DEFAULT_HEIGHT_PX = 200;

function defaultCountFormatter(count: number): string {
  return String(count);
}

export function Histogram({
  buckets,
  label,
  countFormatter = defaultCountFormatter,
  height = DEFAULT_HEIGHT_PX,
  className,
  onChartReady,
}: HistogramProps): ReactElement {
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();
  const isEmpty = buckets.length === 0;

  return (
    <LabeledChartFrame
      className={className}
      isEmpty={isEmpty}
      label={label}
      slot="histogram"
      table={labelledValueTable(
        "Bucket",
        "Count",
        buckets.map((bucket) => ({ label: bucket.label, value: countFormatter(bucket.count) })),
      )}
    >
      {isEmpty ? null : <Chart height={height} label={label} onChartReady={onChartReady} option={buildHistogramOption(buckets, colors, countFormatter)} />}
    </LabeledChartFrame>
  );
}
