import { CtIsolation } from "@orb/testkit/browser";
import { Field } from "@orb/ui/field";
import { Slider } from "@orb/ui/slider";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** A slider in a valid and in an invalid Field, beside probes painted with the primary and destructive colours. */
export function SliderInvalidFillStory(): ReactElement {
  return (
    <CtIsolation subject="Slider" isolates="The fill under an invalid Field paints the destructive colour at full strength">
      <Field label="Valid" name="valid">
        <Slider defaultValue={50} />
      </Field>
      <Field error="Out of range" label="Invalid" name="invalid">
        <Slider defaultValue={50} />
      </Field>
      <span data-probe="primary" style={{ display: "block", backgroundColor: `var(${TOKENS["color.primary"].cssVar})` }} />
      <span data-probe="destructive" style={{ display: "block", backgroundColor: `var(${TOKENS["color.destructive"].cssVar})` }} />
    </CtIsolation>
  );
}
