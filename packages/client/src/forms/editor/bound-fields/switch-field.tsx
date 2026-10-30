// Bound boolean field — the `@orb/ui` Switch (controlled `checked`/`onCheckedChange`) inside
// `<Field>`. Boolean wiring per the mine: `checked=` + the change value, never a string coercion.

import { Field } from "@orb/ui/field";
import { Switch } from "@orb/ui/switch";
import type { ReactElement } from "react";
import type { BoundFieldShellProps } from "./use-bound-field.ts";
import { useBoundField } from "./use-bound-field.ts";

export function SwitchField(props: BoundFieldShellProps): ReactElement {
  const { field, fieldProps } = useBoundField<boolean>(props);
  return (
    <Field {...fieldProps}>
      {/* No `control-has-associated-label` suppression since #1633: `jsx-a11y`'s components map now resolves
          `Switch` to `input`, which that rule's `ignoreElements` carries, so the render-time FieldRootContext
          `aria-labelledby` injection the rule is structurally blind to no longer costs a directive here.
          `SelectField` still pays one — `Select` maps to `select`, which the list does not carry. */}
      <Switch
        checked={field.state.value}
        onCheckedChange={(checked): void => {
          field.handleChange(checked);
        }}
        onBlur={field.handleBlur}
      />
    </Field>
  );
}
