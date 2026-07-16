// An INTERACTIVE 2D scatter over the ECharts seal — the one chart in the family whose reason for being
// is point-level click: raw inline-SVG scatters can't carry an interactive role under the feature belt,
// so a canvas scatter with a native `click` handler is the sanctioned drill-through path (north-star §6.4).
// Categories are pre-grouped by the caller; each takes its color from `useChartTheme().palette` by index
// (ui owns the palette), so a custom theme retints the whole plot. `onPointClick` gets the point's `id`.
import type { ReactElement } from "react";
import type { ChartEvent, OrbEChartsInstance } from "../chart";
import { Chart } from "../chart";
import { useChartTheme } from "../chart/use-chart-theme";
import { LabeledChartFrame } from "../labeled-chart-frame";
import type { ScatterSeries } from "./option";
import { buildScatterOption, pointId } from "./option";

export type { ScatterPoint, ScatterSeries } from "./option";

const DEFAULT_HEIGHT_PX = 320;

export interface ScatterProps {
  /** Points pre-grouped into categories — each takes a `useChartTheme().palette` stop by index. */
  readonly series: readonly ScatterSeries[];
  /** The chart's accessible name AND its visible heading. */
  readonly label: string;
  /** Fires with the clicked point's opaque `id` — the entire reason this is a canvas chart, not an SVG. */
  readonly onPointClick?: ((id: string) => void) | undefined;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

export function Scatter({ series, label, onPointClick, height = DEFAULT_HEIGHT_PX, className, onChartReady }: ScatterProps): ReactElement {
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();
  const isEmpty = series.every((cat) => cat.points.length === 0);

  const handleClick = (event: ChartEvent): void => {
    const id = pointId(event.data);
    if (id !== null) {
      onPointClick?.(id);
    }
  };

  return (
    <LabeledChartFrame className={className} isEmpty={isEmpty} label={label} slot="scatter">
      {isEmpty ? null : (
        <Chart
          height={height}
          label={label}
          onChartReady={onChartReady}
          onEvents={onPointClick === undefined ? undefined : { click: handleClick }}
          option={buildScatterOption(series, colors)}
        />
      )}
    </LabeledChartFrame>
  );
}
