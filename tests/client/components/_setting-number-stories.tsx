import { SettingRowGroup, SettingTrackRow } from "@orb/client/components";
import { CtAppearanceChannels, CtIsolation } from "@orb/testkit/browser";
import { Field } from "@orb/ui/field";
import { NumberField } from "@orb/ui/number-field";
import { TOKENS } from "@orb/ui/tokens";
import type { ReactElement } from "react";

/** The production settings group and track row around a stepped NumberField, with the touch-target token resolved in the same document. */
export function SettingNumberStory(): ReactElement {
  return (
    <CtIsolation subject="settings number row" isolates="The bordered settings group's stepper boxes, without a feature's data reads">
      <CtAppearanceChannels settings={{}}>
        <SettingRowGroup>
          <SettingTrackRow>
            <Field label="Auto-continue rounds" orientation="horizontal">
              <NumberField aria-label="Auto-continue rounds" defaultValue={3} min={0} max={10} />
            </Field>
          </SettingTrackRow>
        </SettingRowGroup>
        <span data-probe="touch-target" style={{ display: "block", blockSize: `var(${TOKENS["size.touch-target"].cssVar})` }} />
      </CtAppearanceChannels>
    </CtIsolation>
  );
}
