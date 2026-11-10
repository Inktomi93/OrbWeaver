// The Remove under an empty optional rule field: it holds nothing to lose, and the field's Add control brings it back.
// Its own module so the destructive-confirm exemption covers this control alone, never the filled-field confirm.

import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";

interface RuleRemoveEmptyFieldProps {
  /** The field's lower-case name, as the control says it. */
  readonly name: string;
  readonly onRemove: () => void;
}

export function RuleRemoveEmptyField({ name, onRemove }: RuleRemoveEmptyFieldProps): ReactElement {
  return (
    <Button variant="ghost" justify="start" onClick={onRemove}>
      Remove {name}
    </Button>
  );
}
