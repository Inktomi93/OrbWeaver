import { NO_VALUE, NO_VALUE_NAME } from "@orb/kit/strings";
import type { ReactElement } from "react";

/** The empty-value glyph with its accessible name, for a value slot that has nothing to show. */
export function NoValue(): ReactElement {
  return (
    <span aria-label={NO_VALUE_NAME} data-slot="no-value" role="img">
      {NO_VALUE}
    </span>
  );
}
