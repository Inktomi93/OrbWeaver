// Big-number + optional sparkline, or a bare number+delta tile when there's no series to chart.
import type { ReactElement } from "react";
import { ChevronDown, ChevronUp, Icon, Minus } from "#primitives/icons";
import type { OrbEChartsInstance } from "../chart";
import { Chart } from "../chart";
import { useChartTheme } from "../chart/use-chart-theme";
import { buildSparklineOption } from "./option";
import { statFigureVariants } from "./variants";

export interface StatFigureDelta {
  /** Pre-formatted delta text (e.g. "+12% this week") — no Intl/number logic in ui. */
  readonly text: string;
  readonly direction: "up" | "down" | "flat";
}

export interface StatFigureProps {
  /** The metric name — also the sparkline's accessible name. */
  readonly label: string;
  /** Pre-formatted big number (e.g. "1,204") — ui takes a string, no Intl logic in ui. */
  readonly value: string;
  readonly delta?: StatFigureDelta;
  /** Chronological raw values for the sparkline. Omit to render the number alone. */
  readonly trend?: readonly number[];
  readonly sparklineHeight?: number;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

const DELTA_GLYPH = { up: ChevronUp, down: ChevronDown, flat: Minus } as const;
const DELTA_GLYPH_LABEL = { up: "Up", down: "Down", flat: "Flat" } as const;
const DEFAULT_SPARKLINE_HEIGHT_PX = 48;

/** Omit `trend` for a bare number+delta tile (no chart mounts). */
export function StatFigure({
  label,
  value,
  delta,
  trend,
  sparklineHeight = DEFAULT_SPARKLINE_HEIGHT_PX,
  className,
  onChartReady,
}: StatFigureProps): ReactElement {
  const slots = statFigureVariants({ direction: delta?.direction });
  const DeltaGlyph = delta === undefined ? null : DELTA_GLYPH[delta.direction];
  // Called unconditionally (the sparkline only mounts with `trend`) to satisfy rules-of-hooks.
  const colors = useChartTheme();

  return (
    <div className={slots.root({ className })} data-slot="stat-figure">
      <p className={slots.label()} data-slot="stat-figure-label">
        {label}
      </p>
      <div className={slots.valueRow()}>
        <span className={slots.value()} data-slot="stat-figure-value">
          {value}
        </span>
        {delta === undefined || DeltaGlyph === null ? null : (
          <span className={slots.delta()} data-slot="stat-figure-delta">
            <Icon icon={DeltaGlyph} label={DELTA_GLYPH_LABEL[delta.direction]} size="xs" />
            {delta.text}
          </span>
        )}
      </div>
      {trend === undefined || trend.length === 0 ? null : (
        <div className={slots.sparkline()} data-slot="stat-figure-sparkline">
          <Chart
            height={sparklineHeight}
            label={`${label} trend`}
            onChartReady={onChartReady}
            option={buildSparklineOption(trend, colors)}
          />
        </div>
      )}
    </div>
  );
}
