// A label over a big pre-formatted number.
import { NO_VALUE } from "@orb/kit/strings";
import type { ReactElement } from "react";
import { NoValue } from "#primitives/text";
import { statFigureVariants } from "./variants.ts";

export interface StatFigureProps {
  /** The metric name. */
  readonly label: string;
  /** Pre-formatted big number (e.g. "1,204") — ui takes a string, no Intl logic in ui. The empty-value glyph renders with its name. */
  readonly value: string;
}

export function StatFigure({ label, value }: StatFigureProps): ReactElement {
  const slots = statFigureVariants();
  const shown = value === NO_VALUE ? <NoValue /> : value;

  return (
    <div className={slots.root()} data-slot="stat-figure">
      <p className={slots.label()} data-slot="stat-figure-label">
        {label}
      </p>
      <div className={slots.valueRow()}>
        <span className={slots.value()} data-slot="stat-figure-value">
          {shown}
        </span>
      </div>
    </div>
  );
}
