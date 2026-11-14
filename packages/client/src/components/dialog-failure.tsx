// The one failure line a dialog says a refused or failed act in. It reads at the body step, the dialog description's own,
// because the most important sentence in a failed dialog is never the smallest text in it, and it is an alert, because it
// arrives after the press and a reader who is not looking at it still hears it.

import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";

export interface DialogFailureProps {
  /** For a control that names the line as its error (`aria-errormessage` or `aria-describedby`). */
  readonly id?: string;
  readonly children: ReactNode;
}

export function DialogFailure({ id, children }: DialogFailureProps): ReactElement {
  return (
    <Text data-slot="dialog-failure" {...(id === undefined ? {} : { id })} role="alert" tone="destructive">
      {children}
    </Text>
  );
}
