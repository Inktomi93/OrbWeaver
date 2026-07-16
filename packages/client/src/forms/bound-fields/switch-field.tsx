// Bound boolean field — the `@orb/ui` Switch (controlled `checked`/`onCheckedChange`) inside
// `<Field>`. Boolean wiring per the mine: `checked=` + the change value, never a string coercion.

import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { touchedFieldError } from "./field-error";

export interface SwitchFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  readonly disabled?: boolean;
}

export function SwitchField({ label, description, hint, disabled }: SwitchFieldProps): ReactElement {
  const field = useFieldContext<boolean>();
  const error = touchedFieldError(field.state.meta);
  return (
    <Field label={label} description={description} hint={hint} error={error} disabled={disabled ?? false} name={field.name}>
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label */}
      <Switch
        checked={field.state.value}
        onCheckedChange={(checked): void => {
          field.handleChange(checked);
        }}
        onBlur={field.handleBlur}
      />
    </Field>
  );
}
