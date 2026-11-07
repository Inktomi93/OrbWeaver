import { CtIsolation } from "@orb/testkit/browser";
import { NumberField } from "@orb/ui/number-field";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** The knob-row number cell and the stepped field, with a probe that resolves the touch-target token in the same document. */
export function InlineNumberFieldStory(): ReactElement {
  return (
    <CtIsolation subject="NumberField" isolates="The inline cell's and the stepped field's boxes at each pointer class, without the preset row around them">
      <NumberField aria-label="Temperature" defaultValue={7} layout="inline" />
      <NumberField aria-label="Retries" defaultValue={3} />
      <span data-probe="touch-target" style={{ display: "block", blockSize: `var(${TOKENS["size.touch-target"].cssVar})` }} />
    </CtIsolation>
  );
}
