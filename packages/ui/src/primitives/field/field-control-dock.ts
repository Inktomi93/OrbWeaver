// Does an ancestor `<Field>` dock this control at the row's END (the horizontal arm's control column)?
// An anchored popup opened from a docked control aligns to the trigger's end, or it overhangs the pane's
// edge. Its own module for the same reason as `field-labelled.ts`: a context is not a component.

import { createContext, use } from "react";

export const FieldControlDockContext = createContext(false);

/** Is this control docked at the end of a horizontal `<Field>` row? */
export function useFieldControlDocksEnd(): boolean {
  return use(FieldControlDockContext);
}
