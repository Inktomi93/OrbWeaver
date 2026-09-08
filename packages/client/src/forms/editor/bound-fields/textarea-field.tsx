// Bound multi-line field — `<Textarea>` (native `field-sizing: content` autosize) inside `<Field>`.
// Controlled always (see text-field.tsx — the reseed lifecycle depends on it).

import { Field } from "@orb/ui/field";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement, ReactNode } from "react";
import { useBoundField } from "./use-bound-field.ts";

export interface TextareaFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly rows?: number;
}

export function TextareaField(props: TextareaFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  return (
    <Field {...fieldProps}>
      <Textarea
        value={field.state.value}
        onChange={(e): void => {
          field.handleChange(e.target.value);
        }}
        onBlur={field.handleBlur}
        placeholder={props.placeholder}
        rows={props.rows}
      />
    </Field>
  );
}
