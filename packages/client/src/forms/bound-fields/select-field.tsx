// Bound select — the `@orb/ui` Select (full explicit anatomy) inside `<Field>` (label association
// flows through FieldRootContext, so no `label` prop is passed to the Select itself). String-valued
// by design: an entity editor's select axes are string-literal unions; a non-string value wants a
// bespoke field, not a widened generic here.

import { Field } from "@orb/ui/field";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import type { ReactElement, ReactNode } from "react";
import { useFieldContext } from "../contexts";
import { fieldErrorText } from "./field-error";

export interface SelectFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  /** A hover-tip explainer beside the label (`@orb/ui/field` `hint`) — for copy that doesn't need to
   *  stay always-visible. */
  readonly hint?: ReactNode;
  readonly items: SelectItems<string>;
  readonly placeholder?: ReactNode;
  readonly disabled?: boolean;
}

export function SelectField({
  label,
  description,
  hint,
  items,
  placeholder,
  disabled,
}: SelectFieldProps): ReactElement {
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
      <Select
        items={items}
        placeholder={placeholder}
        value={field.state.value}
        onValueChange={(value): void => {
          field.handleChange(value as string);
        }}
      />
    </Field>
  );
}
