// Bound numeric field — the `@orb/ui` NumberField (Base UI stepper + clamp + optional scrub) inside
// `<Field>`. The field value is `number | null` (Base UI's controlled shape — null = empty), so a
// schema wanting a required number expresses it in zod, not by a sentinel.

import { Field } from "@orb/ui/field";
import { NumberField as UiNumberField } from "@orb/ui/number-field";
import type { ReactElement, ReactNode } from "react";
import { useBoundField } from "./use-bound-field.ts";

export interface BoundNumberFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  /** Empty-state text — for a blank-means-the-default field, the EFFECTIVE default (e.g. `"2048 (default)"`)
   *  so an unset knob reads as configured-by-default instead of broken. Never writes the value. */
  readonly placeholder?: string;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
  readonly disabled?: boolean;
}

export function BoundNumberField(props: BoundNumberFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<number | null>(props);
  return (
    <Field {...fieldProps}>
      <UiNumberField
        // The `<Field>` label names the INPUT (Base UI's `aria-labelledby`, which outranks this), but it
        // reaches neither stepper button — so three NumberFields in one column announced three bare
        // "Decrease"es (side-eye F-20). Forwarding the label as `aria-label` is what gives the steppers a
        // subject; a non-string label has no name to forward and keeps the bare verb.
        {...(typeof props.label === "string" ? { "aria-label": props.label } : {})}
        max={props.max}
        min={props.min}
        onBlur={field.handleBlur}
        onValueChange={(value): void => {
          field.handleChange(value);
        }}
        placeholder={props.placeholder}
        step={props.step}
        value={field.state.value}
      />
    </Field>
  );
}
