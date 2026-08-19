// An INTERACTIVE 2D scatter over the ECharts seal — the one chart in the family whose reason for being
// is point-level click: raw inline-SVG scatters can't carry an interactive role under the feature belt,
// so a canvas scatter with a native `click` handler is the sanctioned drill-through path (north-star §6.4).
// Categories are pre-grouped by the caller; each takes its color from `useChartTheme().palette` by index
// (ui owns the palette), so a custom theme retints the whole plot. `onPointClick` gets the point's `id`.
import type { ReactElement } from "react";
import type { ChartEvent, OrbEChartsInstance } from "../chart/index.ts";
import { Chart } from "../chart/index.ts";
import type { ChartColors } from "../chart/use-chart-theme.ts";
import { useChartTheme } from "../chart/use-chart-theme.ts";
import { LabeledChartFrame } from "../labeled-chart-frame/index.ts";
import type { ScatterSeries } from "./option.ts";
import { buildScatterOption, pointId } from "./option.ts";
import { scatterLegendVariants } from "./variants.ts";

export type { ScatterPoint, ScatterSeries } from "./option.ts";

const DEFAULT_HEIGHT_PX = 320;

export interface ScatterProps {
  /** Points pre-grouped into categories — each takes a `useChartTheme().palette` stop by index. */
  readonly series: readonly ScatterSeries[];
  /** The chart's accessible name AND its visible heading. */
  readonly label: string;
  /** Render the DOM key beneath the plot: one row per category — swatch · name · point count.
   *  @defaultValue false */
  readonly legend?: boolean;
  /** Fires with the clicked point's opaque `id` — the entire reason this is a canvas chart, not an SVG. */
  readonly onPointClick?: ((id: string) => void) | undefined;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

/**
 * THE KEY THAT MAKES A CATEGORICAL PLOT READABLE — and it lives HERE, in the primitive, for two reasons a
 * caller cannot work around. (1) ui owns the palette: the swatch has to be the SAME resolved stop the canvas
 * just painted with, and `useChartTheme` is ui-internal, so a legend assembled in a feature would be matching
 * colours by convention rather than by construction. (2) the kit is the only painter (UI-Arch §1.1/§4) — a
 * feature may not put a className on a raw element, which a swatch is.
 *
 * It is DOM, never canvas: a legend drawn into the plot is pixels, and pixels cannot be read out, tabbed to,
 * or zoomed. The swatch is `aria-hidden` decoration and the row's own words are the datum, so the key reads
 * identically with no colour perception at all — which is the point, since the plot's meaning is colour.
 */
function ScatterLegend({
  series,
  colors,
  label,
}: {
  readonly series: readonly ScatterSeries[];
  readonly colors: ChartColors;
  readonly label: string;
}): ReactElement {
  const slots = scatterLegendVariants();
  return (
    <ul aria-label={`${label} key`} className={slots.root()} data-slot="scatter-legend">
      {series.map((category, index) => (
        <li className={slots.item()} data-slot="scatter-legend-item" key={category.name}>
          <span
            aria-hidden={true}
            className={slots.swatch()}
            // Inline, like every other resolved-token paint in this family: the value comes from the live
            // token store at render, so a theme switch repaints the key with the plot.
            style={{ backgroundColor: colors.palette[index % colors.palette.length] ?? colors.series }}
          />
          <span className={slots.name()}>{category.name}</span>
          <span className={slots.count()}>{category.points.length}</span>
        </li>
      ))}
    </ul>
  );
}

export function Scatter({ series, label, legend = false, onPointClick, height = DEFAULT_HEIGHT_PX, className, onChartReady }: ScatterProps): ReactElement {
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
        <>
          <Chart
            height={height}
            label={label}
            onChartReady={onChartReady}
            onEvents={onPointClick === undefined ? undefined : { click: handleClick }}
            option={buildScatterOption(series, colors)}
          />
          {legend ? <ScatterLegend colors={colors} label={label} series={series} /> : null}
        </>
      )}
    </LabeledChartFrame>
  );
}
