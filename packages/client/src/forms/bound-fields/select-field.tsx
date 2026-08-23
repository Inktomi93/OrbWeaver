// Bound select — the `@orb/ui` Select (full explicit anatomy) inside `<Field>` (label association
// flows through FieldRootContext, so no `label` prop is passed to the Select itself). String-valued
// by design: an entity editor's select axes are string-literal unions; a non-string value wants a
// bespoke field, not a widened generic here.

import { Field } from "@orb/ui/field";
import type { SelectItems } from "@orb/ui/select";
import { Select } from "@orb/ui/select";
import type { ReactElement, ReactNode } from "react";
import { useBoundField } from "./use-bound-field.ts";

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

export function SelectField(props: SelectFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  return (
    <Field {...fieldProps}>
      {/* eslint-disable-next-line jsx-a11y/control-has-associated-label -- #579 source-verified: association
          flows through Base UI's FieldRootContext at render time (`BaseField.Control` injects
          `aria-labelledby` — packages/ui/src/primitives/select/select.tsx), never as a literal JSX prop on
          this element, so no `control-has-associated-label` option (labelAttributes/controlComponents/depth)
          can see it. */}
      <Select
        items={props.items}
        placeholder={props.placeholder}
        value={field.state.value}
        onValueChange={(value): void => {
          field.handleChange(value as string);
        }}
        onOpenChange={(open): void => {
          if (!open) {
            field.handleBlur();
          }
        }}
      />
    </Field>
  );
}
