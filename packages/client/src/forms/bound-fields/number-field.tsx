// Bound numeric field — the `@orb/ui` NumberField (Base UI stepper + clamp + optional scrub) inside
// `<Field>`. The field value is `number | null` (Base UI's controlled shape — null = empty), so a
// schema wanting a required number expresses it in zod, not by a sentinel.

import { Field } from "@orb/ui/field";
import { NumberField as UiNumberField } from "@orb/ui/number-field";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { touchedFieldError } from "./field-error";

export interface BoundNumberFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
}

export function BoundNumberField({
  label,
  description,
  hint,
  min,
  max,
  step,
  disabled,
}: BoundNumberFieldProps): ReactElement {
  const field = useFieldContext<number | null>();
  const error = touchedFieldError(field.state.meta);
  return (
    <Field
      label={label}
      description={description}
      hint={hint}
      error={error}
      disabled={disabled ?? false}
      name={field.name}
    >
      <UiNumberField
        value={field.state.value}
        onValueChange={(value): void => {
          field.handleChange(value);
        }}
        onBlur={field.handleBlur}
        min={min}
        max={max}
        step={step}
      />
    </Field>
  );
}
