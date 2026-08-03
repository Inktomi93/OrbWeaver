// The shared labeled-frame both corpus-viz charts (BarList/Histogram) hand-rolled: a heading above
// the `<Chart>` canvas, or an EmptyState when there is no data. `slot` names the data-slot pair
// (`<slot>` on the root, `<slot>-heading` on the heading) so each chart keeps its exact selector
// contract (north-star rule 0.7 — selector stability is API).
import type { ReactElement, ReactNode } from "react";
import { EmptyState } from "#primitives/empty-state";
import { labeledChartFrameVariants } from "./variants.ts";

interface LabeledChartFrameProps {
  /** The chart's accessible name AND its visible heading (or the EmptyState title when empty). */
  readonly label: string;
  /** The data-slot value for the root; the heading gets `${slot}-heading`. */
  readonly slot: string;
  /** When true, renders the EmptyState in place of the heading + chart. */
  readonly isEmpty: boolean;
  readonly emptyDescription?: string;
  readonly className?: string | undefined;
  /** The `<Chart>` canvas — rendered only when not empty. */
  readonly children: ReactNode;
}

export function LabeledChartFrame({ label, slot, isEmpty, emptyDescription = "No data yet.", className, children }: LabeledChartFrameProps): ReactElement {
  const slots = labeledChartFrameVariants();
  if (isEmpty) {
    return (
      <div className={slots.root({ className })} data-slot={slot}>
        <EmptyState title={label} description={emptyDescription} />
      </div>
    );
  }
  return (
    <div className={slots.root({ className })} data-slot={slot}>
      <p className={slots.heading()} data-slot={`${slot}-heading`}>
        {label}
      </p>
      {children}
    </div>
  );
}
