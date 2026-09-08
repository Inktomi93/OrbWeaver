// Bound SINGLE-select segment — the `@orb/ui` ToggleGroup (single) inside `<Field>`, for a small fixed
// enum whose OUTCOME is spatial/visual and whose options deserve to sit side by side instead of behind a
// popup (#866 §7.8, the seen-not-read rebuilds — density/elevation are its first consumers; the owner's
// bar: a labelled segment, not a Select you must open to see). `MultiToggleField`'s exact anatomy with a
// scalar value; a pick is REQUIRED — clicking the pressed option again would empty the group, and an
// autosaving enum with no value is a hole, so the empty pick is refused (the value keeps standing).

import { Field } from "@orb/ui/field";
import type { SelectOption } from "@orb/ui/select";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useBoundField } from "./use-bound-field.ts";

export interface SegmentFieldProps {
  readonly label: string;
  readonly description?: string;
  readonly items: readonly SelectOption<string>[];
  readonly disabled?: boolean;
}

export function SegmentField(props: SegmentFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  return (
    <Field {...fieldProps}>
      {/* THE `aria-label` BELOW IS LOAD-BEARING and must not be swept as a duplicate of the Field's label
          (#1621) — a `ToggleGroup` is not a `Field.Control`, so the Field's label reaches nothing and this is
          the group's only name. The Input/Switch/Select families measured the OTHER way and lost theirs.
          Evidence: `tests/client/a11y/field-control-name.suite.ct.tsx`. */}
      <ToggleGroup
        value={[field.state.value]}
        onValueChange={(next): void => {
          const picked = next[0];
          // The empty pick (re-clicking the pressed option) is refused — an enum knob always has a value.
          if (picked !== undefined && picked !== field.state.value) {
            field.handleChange(picked);
          }
        }}
        onBlur={field.handleBlur}
        disabled={props.disabled ?? false}
        aria-label={props.label}
      >
        {props.items.map((item) => (
          // `intent="outline"` for the MultiToggleField reason verbatim: in a FORM an unselected option
          // must read as an option (a box), not a caption — one rail, stated once, both toggle fields.
          <Toggle key={item.value} value={item.value} aria-label={item.label} intent="outline">
            {item.label}
          </Toggle>
        ))}
      </ToggleGroup>
    </Field>
  );
}
