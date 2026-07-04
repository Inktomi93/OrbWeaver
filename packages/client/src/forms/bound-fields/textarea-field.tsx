// Bound multi-line field — `<Textarea>` (native `field-sizing: content` autosize) inside `<Field>`.
// Controlled always (see text-field.tsx — the reseed lifecycle depends on it).

import { Field } from "@orb/ui/field";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { fieldErrorText } from "./field-error";

export interface TextareaFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly rows?: number;
}

export function TextareaField({
  label,
  description,
  placeholder,
  disabled,
  rows,
}: TextareaFieldProps): ReactElement {
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
      <Textarea
        value={field.state.value}
        onChange={(e): void => {
          field.handleChange(e.target.value);
        }}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        rows={rows}
      />
    </Field>
  );
}
