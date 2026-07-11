// Bound text field — `useFieldContext<string>()` + the `<Field>`-wrapped `<Input>`. CONTROLLED
// (`value=`, never `defaultValue=`) ALWAYS: an uncontrolled input ignores `form.reset(saved)` and
// reseeds, silently breaking the save/discard/reseed lifecycle (UI-Lib-TanStack-Form.md §9 — the
// ui-libraries example's `defaultValue` binding is the documented trap, INVERTED here on purpose).

import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { fieldErrorText } from "./field-error";

export interface TextFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** Input rendering mode — `password` masks (the admin create/reset-password fields). Text-shaped
   *  values only; a number wants `NumberField`, not a widened `type` here. @defaultValue "text" */
  readonly type?: "text" | "password";
  /** Autofill hint forwarded to the native input (`"new-password"` on the admin password fields so a
   *  browser never offers the ADMIN'S saved login inside another user's form). */
  readonly autoComplete?: string;
}

export function TextField({
  label,
  description,
  hint,
  placeholder,
  disabled,
  type,
  autoComplete,
}: TextFieldProps): ReactElement {
  const field = useFieldContext<string>();
  const error = fieldErrorText(field.state.meta.errors);
  return (
    <Field
      label={label}
      description={description}
      hint={hint}
      error={field.state.meta.isTouched ? error : null}
      disabled={disabled ?? false}
      name={field.name}
    >
      <Input
        value={field.state.value}
        onChange={(e): void => {
          field.handleChange(e.target.value);
        }}
        onBlur={field.handleBlur}
        placeholder={placeholder}
        type={type ?? "text"}
        autoComplete={autoComplete}
      />
    </Field>
  );
}
