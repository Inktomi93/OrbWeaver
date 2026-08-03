// Bound color field — the `@orb/ui` ColorField (swatch trigger → popover with a native picker + a hex
// input; validates via the SAME `isSafeColor` the D44 ThemeScope clamp uses) inside `<Field>`. The field
// value is the color STRING (hex/rgb/hsl/oklch/named); an invalid draft never reaches `handleChange`
// (the primitive gates it). First consumer: the theme editor's token-override pickers.

import { ColorField as UiColorField } from "@orb/ui/color-field";
import { Field } from "@orb/ui/field";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useBoundField } from "./use-bound-field.ts";

/** What an EMPTY colour reads as — the one word this app's fallback story uses everywhere. */
const INHERIT_LABEL = "Inherit";

export interface BoundColorFieldProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
}

/**
 * A bound colour picker — the swatch trigger PLUS its value in words.
 *
 * THE SWATCH ALONE CANNOT SAY "INHERIT" (side-eye 2026-08-03 P2). The character theme cluster rendered seven
 * `label + 32px swatch` pairs with no value text and no inherit marker, under a helper line promising you
 * could "leave a field on Inherit" — so nothing on the panel distinguished a colour the card SET from one it
 * merely inherits, and both painted the same chip (an unset field's chip is simply the resolved theme
 * colour). The mock prints the value in the swatch row for exactly this reason. The readout is also the ONE
 * place the word "Inherit" is spelled, so the cluster stops carrying three vocabularies for one idea.
 */
export function BoundColorField(props: BoundColorFieldProps): ReactElement {
  const { field, fieldProps } = useBoundField<string>(props);
  const value = field.state.value;
  const readout = value === "" ? INHERIT_LABEL : value;
  return (
    <Field {...fieldProps}>
      <Row align="center" gap="field">
        <UiColorField
          onValueChange={(next): void => {
            field.handleChange(next);
          }}
          resetLabel={INHERIT_LABEL}
          value={value}
          {...(typeof props.label === "string" ? { "aria-label": props.label } : {})}
        />
        {/* aria-hidden: the value is the CONTROL's own state, and the trigger already carries the field's
            accessible name — announcing the string again would read the colour twice per field. */}
        <Text aria-hidden={true} as="span" className="truncate" voice="gloss">
          {readout}
        </Text>
      </Row>
    </Field>
  );
}
