// Bound macro-aware textarea — `useFieldContext<string>()` binding `@orb/ui/macro-textarea` inside
// `<Field>`. The first consumer is the persona editor's description (FINAL-Persona §A.6b — "macro-aware
// textarea"); the macro catalog is passed in as `suggestions` (ui imports no domain registry). Controlled
// always (see text-field.tsx — the reseed lifecycle depends on it).

import { Field } from "@orb/ui/field";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import { MacroTextarea } from "@orb/ui/macro-textarea";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { fieldErrorText } from "./field-error";

export interface MacroFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** The macro catalog to complete against on `{{` (app-level data — the field never imports a registry). */
  readonly suggestions: readonly MacroSuggestion[];
  readonly placeholder?: string;
  readonly rows?: number;
  readonly disabled?: boolean;
}

export function MacroField({
  label,
  description,
  suggestions,
  placeholder,
  rows,
  disabled,
}: MacroFieldProps): ReactElement {
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
      <MacroTextarea
        value={field.state.value}
        onChange={(next): void => {
          field.handleChange(next);
        }}
        onBlur={field.handleBlur}
        suggestions={suggestions}
        disabled={disabled ?? false}
        {...(placeholder === undefined ? {} : { placeholder })}
        {...(rows === undefined ? {} : { rows })}
      />
    </Field>
  );
}
