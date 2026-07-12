// Bound multi-select — the `@orb/ui` ToggleGroup (`multiple`) inside `<Field>`, for a small fixed enum
// SET (WS3's first consumer: `appearance.blurSurfaces`). String-array valued by design, mirroring
// `SelectField`'s string-valued convention — a bound field for a non-string array wants its own home,
// not a widened generic here. `items` reuses `@orb/ui/select`'s `SelectOption` shape (the same
// labelled-option every bound select takes) — the FLAT half only (`SelectItems`'s grouped variant has
// no toggle-group analogue, so this field narrows to the shape it can actually render).

import { Field } from "@orb/ui/field";
import type { SelectOption } from "@orb/ui/select";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useFieldContext } from "../contexts";
import { touchedFieldError } from "./field-error";

export interface MultiToggleFieldProps {
  readonly label: string;
  readonly description?: string;
  readonly items: readonly SelectOption<string>[];
  readonly disabled?: boolean;
}

export function MultiToggleField({
  label,
  description,
  items,
  disabled,
}: MultiToggleFieldProps): ReactElement {
  const field = useFieldContext<readonly string[]>();
  const error = touchedFieldError(field.state.meta);
  return (
    <Field
      label={label}
      description={description}
      error={error}
      disabled={disabled ?? false}
      name={field.name}
    >
      <ToggleGroup
        multiple={true}
        value={field.state.value}
        onValueChange={(next): void => {
          field.handleChange(next);
        }}
        disabled={disabled ?? false}
        aria-label={label}
      >
        {items.map((item) => (
          <Toggle key={item.value} value={item.value} aria-label={item.label}>
            {item.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </Field>
  );
}
