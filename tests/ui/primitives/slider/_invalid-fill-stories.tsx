import { CtIsolation } from "@orb/testkit/browser";
import { Field } from "@orb/ui/field";
import { Slider } from "@orb/ui/slider";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** A neutral slider in a valid and in an invalid Field, beside a probe painted with the destructive colour. */
export function SliderInvalidFillStory(): ReactElement {
  return (
    <CtIsolation subject="Slider" isolates="The neutral fill under an invalid Field paints the destructive colour at full strength">
      <Field label="Valid" name="valid">
        <Slider defaultValue={50} tone="neutral" />
      </Field>
      <Field error="Out of range" label="Invalid" name="invalid">
        <Slider defaultValue={50} tone="neutral" />
      </Field>
      <span data-probe="destructive" style={{ display: "block", backgroundColor: `var(${TOKENS["color.destructive"].cssVar})` }} />
    </CtIsolation>
  );
}
