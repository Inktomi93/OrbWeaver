// A label over a big pre-formatted number.
import type { ReactElement } from "react";
import { statFigureVariants } from "./variants.ts";

export interface StatFigureProps {
  /** The metric name. */
  readonly label: string;
  /** Pre-formatted big number (e.g. "1,204") — ui takes a string, no Intl logic in ui. */
  readonly value: string;
}

export function StatFigure({ label, value }: StatFigureProps): ReactElement {
  const slots = statFigureVariants();

  return (
    <div className={slots.root()} data-slot="stat-figure">
      <p className={slots.label()} data-slot="stat-figure-label">
        {label}
      </p>
      <div className={slots.valueRow()}>
        <span className={slots.value()} data-slot="stat-figure-value">
          {value}
        </span>
      </div>
    </div>
  );
}
