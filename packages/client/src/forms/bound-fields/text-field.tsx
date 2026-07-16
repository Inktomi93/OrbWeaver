// Bound text field — `useBoundField<string>()` + the `<Field>`-wrapped `<Input>`. CONTROLLED
// (`value=`, never `defaultValue=`) ALWAYS: an uncontrolled input ignores `form.reset(saved)` and
// reseeds, silently breaking the save/discard/reseed lifecycle (UI-Lib-TanStack-Form.md §9 — the
// ui-libraries example's `defaultValue` binding is the documented trap, INVERTED here on purpose).

import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import type { ReactElement, ReactNode } from "react";
import { useBoundField } from "./use-bound-field";

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

export function TextField(props: TextFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  return (
    <Field {...fieldProps}>
      <Input
        value={field.state.value}
        onChange={(e): void => {
          field.handleChange(e.target.value);
        }}
        onBlur={field.handleBlur}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete}
      />
    </Field>
  );
}
