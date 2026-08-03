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
import { useBoundField } from "./use-bound-field.ts";

export interface MultiToggleFieldProps {
  readonly label: string;
  readonly description?: string;
  readonly items: readonly SelectOption<string>[];
  readonly disabled?: boolean;
  /**
   * A caller-computed invalid message, rendered through `<Field>`'s error slot and overriding the
   * touch-gated one. It exists because the SET-EMPTY state is a real defect on an AUTOSAVING form and
   * nothing else can say so: the regex library's `placement: []` parses (the card-boundary accept-and-drop
   * heal keeps it lenient by law) and saves, and the script then runs nowhere — silently, until this line
   * (side-eye 2026-08-03 P2). Untouched-and-empty is exactly the state a touch-gated error cannot reach.
   */
  readonly error?: string;
}

export function MultiToggleField(props: MultiToggleFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<readonly string[]>(props);
  return (
    <Field {...fieldProps} {...(props.error === undefined ? {} : { error: props.error })}>
      <ToggleGroup
        multiple={true}
        value={field.state.value}
        onValueChange={(next): void => {
          field.handleChange(next);
        }}
        disabled={props.disabled ?? false}
        aria-label={props.label}
      >
        {props.items.map((item) => (
          <Toggle key={item.value} value={item.value} aria-label={item.label}>
            {item.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </Field>
  );
}
