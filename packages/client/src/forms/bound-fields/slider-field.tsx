// Bound slider field — the `@orb/ui` Slider (Base UI slider, single-thumb) inside `<Field>`. The field
// value is a scalar `number` (a slider always has a value — no null/empty state like NumberField).
// Convention mirrors `number-field.tsx` exactly. No `label`/`aria-label` passed to the sealed `Slider`
// (unlike ColorField's popover trigger): `Slider.Root` extends Base UI's `FieldRootState` (per
// `@orb/ui/field`'s doc comment), so `<Field>`'s own `Field.Label` auto-associates with it — same as
// NumberField.

import { Field } from "@orb/ui/field";
import { Slider as UiSlider } from "@orb/ui/slider";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { touchedFieldError } from "./field-error";

export interface BoundSliderFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
}

export function BoundSliderField({
  label,
  description,
  min,
  max,
  step,
  disabled,
}: BoundSliderFieldProps): ReactElement {
  const field = useFieldContext<number>();
  const error = touchedFieldError(field.state.meta);
  return (
    <Field
      label={label}
      description={description}
      error={error}
      disabled={disabled ?? false}
      name={field.name}
    >
      <UiSlider
        value={field.state.value}
        onValueChange={(value): void => {
          field.handleChange(value);
        }}
        onBlur={field.handleBlur}
        min={min}
        max={max}
        step={step}
        showValue={true}
      />
    </Field>
  );
}
