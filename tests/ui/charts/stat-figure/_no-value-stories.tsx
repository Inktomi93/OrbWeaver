import { NO_VALUE } from "@orb/kit/strings";
import { CtIsolation } from "@orb/testkit/browser";
import { StatFigure } from "@orb/ui/stat-figure";
import type { ReactElement } from "react";

/** A figure with a measured value beside one with none. */
export function StatFigureNoValueStory(): ReactElement {
  return (
    <CtIsolation subject="StatFigure" isolates="A figure with no value shows the shared empty-value glyph under its accessible name">
      <StatFigure label="Measured" value="1,204" />
      <StatFigure label="Unmeasured" value={NO_VALUE} />
    </CtIsolation>
  );
}
