// Bound color field — the `@orb/ui` ColorField (swatch trigger → popover with a native picker + a hex
// input; validates via the SAME `isSafeColor` the D44 ThemeScope clamp uses) inside `<Field>`. The field
// value is the color STRING (hex/rgb/hsl/oklch/named); an invalid draft never reaches `handleChange`
// (the primitive gates it). First consumer: the theme editor's token-override pickers.

import { ColorField as UiColorField } from "@orb/ui/color-field";
import { Field } from "@orb/ui/field";
import type { ReactElement, ReactNode } from "react";
import { useBoundField } from "./use-bound-field";

export interface BoundColorFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

export function BoundColorField(props: BoundColorFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  return (
    <Field {...fieldProps}>
      <UiColorField
        onValueChange={(value): void => {
          field.handleChange(value);
        }}
        value={field.state.value}
        {...(typeof props.label === "string" ? { "aria-label": props.label } : {})}
      />
    </Field>
  );
}
