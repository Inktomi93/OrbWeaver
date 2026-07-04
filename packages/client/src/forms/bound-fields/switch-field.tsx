// Bound boolean field — the `@orb/ui` Switch (controlled `checked`/`onCheckedChange`) inside
// `<Field>`. Boolean wiring per the mine: `checked=` + the change value, never a string coercion.

import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { fieldErrorText } from "./field-error";

export interface SwitchFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

export function SwitchField({ label, description, disabled }: SwitchFieldProps): ReactElement {
  const field = useFieldContext<boolean>();
  const error = fieldErrorText(field.state.meta.errors);
  return (
    <Field
      label={label}
      description={description}
      error={field.state.meta.isTouched ? error : null}
      disabled={disabled ?? false}
      name={field.name}
    >
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
