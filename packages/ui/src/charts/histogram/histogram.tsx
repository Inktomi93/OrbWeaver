// <Histogram> — a distribution chart over PRE-BINNED buckets (ui-package-design §9 v1 corpus-viz
// set: chunk-size distribution, score distribution, etc). Binning is generic math but it's still
// the CALLER's domain-shaped decision (bucket width, edge handling) — this component only renders
// already-bucketed counts, matching bar-list's dumb-data-in contract. Bars sit flush
// (`barCategoryGap: "0%"`) — the one visual cue that distinguishes a distribution from an ordinary
// bar chart with gapped bars.
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

/**
 * @example
 * ```tsx
 * <Histogram
 *   label="Chunk size distribution"
 *   buckets={[{ label: "0–99", count: 12 }, { label: "100–199", count: 40 }]}
 * />
 * ```
 */
export function Histogram({
  buckets,
  label,
  height = DEFAULT_HEIGHT_PX,
  className,
  onChartReady,
}: HistogramProps): ReactElement {
  const slots = histogramVariants();
  // Resolve chart-chrome tokens to concrete canvas colors live, re-reading on theme switch (§11.3).
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
      <Chart
        height={height}
        label={label}
        onChartReady={onChartReady}
        option={buildHistogramOption(buckets, colors)}
      />
    </div>
  );
}
