// Horizontal ranked bars — array order is the rank; this component does not sort.
import type { ReactElement } from "react";
import type { OrbEChartsInstance } from "../chart";
import { Chart } from "../chart";
import { useChartTheme } from "../chart/use-chart-theme";
import { LabeledChartFrame } from "../labeled-chart-frame";
import type { BarListItem } from "./option";
import { buildBarListOption } from "./option";

export type { BarListItem } from "./option";

export interface BarListProps {
  /** Pre-sorted rank order — index 0 renders as the TOP row. */
  readonly items: readonly BarListItem[];
  /** The chart's accessible name AND its visible heading. */
  readonly label: string;
  /** Pre-formatted value display for the bar-end label + tooltip (no Intl/number logic in ui). */
  readonly valueFormatter?: (value: number) => string;
  readonly height?: number | string;
  readonly className?: string;
  readonly onChartReady?: ((instance: OrbEChartsInstance) => void) | undefined;
}

const ROW_HEIGHT_PX = 32;
const CHROME_HEIGHT_PX = 16;

function defaultValueFormatter(value: number): string {
  return String(value);
}

export function BarList({ items, label, valueFormatter = defaultValueFormatter, height, className, onChartReady }: BarListProps): ReactElement {
  // Called unconditionally (before the empty-state branch) to satisfy rules-of-hooks.
  const colors = useChartTheme();
  const isEmpty = items.length === 0;

  return (
    <LabeledChartFrame className={className} isEmpty={isEmpty} label={label} slot="bar-list">
      {isEmpty ? null : (
        <Chart
          height={height ?? items.length * ROW_HEIGHT_PX + CHROME_HEIGHT_PX}
          label={label}
          onChartReady={onChartReady}
          option={buildBarListOption(items, valueFormatter, colors)}
        />
      )}
    </LabeledChartFrame>
  );
}
