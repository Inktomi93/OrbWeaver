// Bound color field — the `@orb/ui` ColorField (swatch trigger → popover with a native picker + a hex
// input; validates via the SAME `isSafeColor` the D44 ThemeScope clamp uses) inside `<Field>`. The field
// value is the color STRING (hex/rgb/hsl/oklch/named); an invalid draft never reaches `handleChange`
// (the primitive gates it). First consumer: the theme editor's token-override pickers.

import { ColorField as UiColorField } from "@orb/ui/color-field";
import { Field } from "@orb/ui/field";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { fieldErrorText } from "./field-error";

export interface BoundColorFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

export function BoundColorField({
  label,
  description,
  disabled,
}: BoundColorFieldProps): ReactElement {
  const field = useFieldContext<string>();
  const error = fieldErrorText(field.state.meta.errors);
  return (
    <Field
      label={label}
      description={description}
      error={field.state.meta.isTouched ? error : null}
      disabled={disabled ?? false}
      name={field.name}
    >
      <UiColorField
        value={field.state.value}
        onValueChange={(value): void => {
          field.handleChange(value);
        }}
        {...(typeof label === "string" ? { "aria-label": label } : {})}
      />
    </Field>
  );
}
