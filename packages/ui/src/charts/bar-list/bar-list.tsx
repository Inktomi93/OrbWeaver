// <BarList> — horizontal ranked bars (ui-package-design §9 corpus-viz v1; the classic "top N"
// chart: top sources by chunk count, top search hits by score, etc). Array ORDER is the rank —
// this component does not sort (dumb-data-in, per the list-row/bar-list precedent: ranking is the
// caller's business logic, not ui's).
import type { ReactElement } from "react";
import { EmptyState } from "#primitives/empty-state";
import type { OrbEChartsInstance } from "../chart";
import { Chart } from "../chart";
import type { BarListItem } from "./option";
import { buildBarListOption } from "./option";
import { barListVariants } from "./variants";

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

/**
 * @example
 * ```tsx
 * <BarList
 *   label="Top sources"
 *   items={[{ id: "a", label: "Handbook", value: 42 }]}
 *   valueFormatter={(n) => `${n} chunks`}
 * />
 * ```
 */
export function BarList({
  items,
  label,
  valueFormatter = defaultValueFormatter,
  height,
  className,
  onChartReady,
}: BarListProps): ReactElement {
  const slots = barListVariants();

  if (items.length === 0) {
    return (
      <div className={slots.root({ className })} data-slot="bar-list">
        <EmptyState title={label} description="No data yet." />
      </div>
    );
  }

  return (
    <div className={slots.root({ className })} data-slot="bar-list">
      <p className={slots.heading()} data-slot="bar-list-heading">
        {label}
      </p>
      <Chart
        height={height ?? items.length * ROW_HEIGHT_PX + CHROME_HEIGHT_PX}
        label={label}
        onChartReady={onChartReady}
        option={buildBarListOption(items, valueFormatter)}
      />
    </div>
  );
}
