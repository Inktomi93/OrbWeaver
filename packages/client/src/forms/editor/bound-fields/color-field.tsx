// Bound color field — the `@orb/ui` ColorField (swatch trigger → popover with a native picker + a hex
// input; validates via the shared kit predicates — `isRenderableColor` since #1358, which asks the
// injection question AND whether the renderer can resolve the value at all) inside `<Field>`. The field
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

/** What a SET colour reads as when its stored notation is not something a person reads. */
const CUSTOM_LABEL = "Custom";

/** A `#rgb` / `#rrggbb` / `#rrggbbaa` value — the one colour notation a reader can actually use (it is what
 *  the popover's own hex field takes, so it is also the value they could re-type). */
const HEX_RE = /^#[0-9a-f]{3,8}$/i;

/**
 * The swatch's value IN WORDS — `Inherit` for unset, the hex for a hex, `Custom` for everything else.
 *
 * IT USED TO PRINT THE RAW STORED STRING (side-eye 2026-08-30 rail-characters P2, #841). The character
 * theme editor showed SIX `oklch(0.85 0.1 62)` strings as user-facing values in one 384px screenful,
 * beside one field reading `Inherit` that was perfectly legible. That is the insider-knowledge-name smell
 * in the product surface: the readout's JOB (below) is to distinguish a field this card SETS from one it
 * inherits, and a word does that as well as a colour-science triple while being readable. The seeded themes
 * are authored in oklch, so this is the resting state of every card that carries a look, not an edge case.
 *
 * The SWATCH still carries the colour itself — the value text never had to.
 */
function colorReadout(value: string): string {
  if (value === "") {
    return INHERIT_LABEL;
  }
  return HEX_RE.test(value) ? value.toLowerCase() : CUSTOM_LABEL;
}

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
  const readout = colorReadout(value);
  return (
    <Field {...fieldProps}>
      <Row align="center" gap="field">
        <UiColorField
          onValueChange={(next): void => {
            field.handleChange(next);
          }}
          onOpenChange={(open): void => {
            if (!open) {
              field.handleBlur();
            }
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
