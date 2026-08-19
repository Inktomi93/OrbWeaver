// Horizontal ranked bars — array order is the rank; this component does not sort.
import type { ReactElement } from "react";
import { useRef } from "react";
import { labelledValueTable } from "../chart/data-table.ts";
import type { OrbEChartsInstance } from "../chart/index.ts";
import { Chart } from "../chart/index.ts";
import { useChartTheme } from "../chart/use-chart-theme.ts";
import { useMeasuredWidthPx } from "../chart/use-measured-width.ts";
import { LabeledChartFrame } from "../labeled-chart-frame/index.ts";
import type { BarListIntent, BarListItem } from "./option.ts";
import { buildBarListOption } from "./option.ts";

export type { BarListIntent, BarListItem } from "./option.ts";

export interface BarListProps {
  /** Pre-sorted rank order — index 0 renders as the TOP row. */
  readonly items: readonly BarListItem[];
  /** The chart's accessible name AND its visible heading. */
  readonly label: string;
  /** Pre-formatted value display for the bar-end label + tooltip (no Intl/number logic in ui). */
  readonly valueFormatter?: (value: number) => string;
  /**
   * The series colour by MEANING. Pass the semantic pair when this chart is one half of a comparison —
   * two auto-scaled charts in the same colour are not a comparison, they are the same picture twice
   * (side-eye ANALYTICS 2026-08-19, P1d). Colour is redundant with `valueMax` + the signed label, never
   * the only carrier of the reading.
   * @defaultValue "accent"
   */
  readonly intent?: BarListIntent;
  /**
   * A value-axis maximum shared with this chart's twin, so both columns measure against ONE scale. Without
   * it ECharts auto-scales each chart to its own maximum and +10 draws the same length as −184.
   */
  readonly valueMax?: number | undefined;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

const ROW_HEIGHT_PX = 32;
const CHROME_HEIGHT_PX = 16;
/** Container-width step the label budgets re-derive at — see `use-measured-width.ts` for why it's coarse. */
const WIDTH_QUANTUM_PX = 16;

function defaultValueFormatter(value: number): string {
  return String(value);
}

export function BarList({
  items,
  label,
  valueFormatter = defaultValueFormatter,
  intent = "accent",
  valueMax,
  height,
  className,
  onChartReady,
}: BarListProps): ReactElement {
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();
  const frameRef = useRef<HTMLDivElement>(null);
  const widthPx = useMeasuredWidthPx(frameRef, WIDTH_QUANTUM_PX);
  const isEmpty = items.length === 0;

  return (
    <LabeledChartFrame
      className={className}
      isEmpty={isEmpty}
      label={label}
      ref={frameRef}
      slot="bar-list"
      table={labelledValueTable(
        "Item",
        "Value",
        items.map((item) => ({ label: item.label, value: valueFormatter(item.value) })),
      )}
    >
      {isEmpty ? null : (
        <Chart
          height={height ?? items.length * ROW_HEIGHT_PX + CHROME_HEIGHT_PX}
          label={label}
          onChartReady={onChartReady}
          option={buildBarListOption(items, valueFormatter, colors, { widthPx, intent, valueMax })}
        />
      )}
    </LabeledChartFrame>
  );
}
