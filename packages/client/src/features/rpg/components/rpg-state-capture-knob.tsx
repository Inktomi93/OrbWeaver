// The Game tab's state-capture knob: how the separate pass (and Resync from story) asks the model for a beat's
// changes. A controlled field the scalar autosave form mounts; its glosses read under the toggle group and describe it.

import type { RpgStateCaptureVehicle } from "@orb/contracts/rpg";
import { RPG_STATE_CAPTURE_VEHICLES } from "@orb/contracts/rpg";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { useId } from "react";
import { STATE_CAPTURE_SCOPE, STATE_CAPTURE_UNAVAILABLE, STATE_CAPTURE_VEHICLE_CONSEQUENCE, STATE_CAPTURE_VEHICLE_LABEL } from "../lib/host-console-labels.ts";
import { Kicker } from "./rpg-kicker.tsx";

export interface StateCaptureKnobProps {
  readonly value: RpgStateCaptureVehicle;
  readonly onChange: (next: RpgStateCaptureVehicle) => void;
  /** The room's effective-delivery verdict: the game asks for a structured reply its model cannot give. */
  readonly structuredUnavailable: boolean;
}

export function StateCaptureKnob({ value, onChange, structuredUnavailable }: StateCaptureKnobProps): ReactElement {
  const scopeId = useId();
  const glossId = useId();
  const unavailableId = useId();
  return (
    <Stack gap="field">
      <Kicker>How the state is asked for</Kicker>
      <Text voice="gloss" id={scopeId}>
        {STATE_CAPTURE_SCOPE}
      </Text>
      <ToggleGroup
        aria-label="State capture"
        aria-describedby={[scopeId, glossId, ...(structuredUnavailable ? [unavailableId] : [])].join(" ")}
        value={[value]}
        onValueChange={(next): void => {
          const picked = RPG_STATE_CAPTURE_VEHICLES.find((vehicle) => vehicle === next[0]);
          if (picked !== undefined) {
            onChange(picked);
          }
        }}
      >
        {RPG_STATE_CAPTURE_VEHICLES.map((vehicle) => (
          <Toggle key={vehicle} value={vehicle}>
            {STATE_CAPTURE_VEHICLE_LABEL[vehicle]}
          </Toggle>
        ))}
      </ToggleGroup>
      <Text voice="gloss" id={glossId}>
        {STATE_CAPTURE_VEHICLE_CONSEQUENCE[value]}
      </Text>
      {structuredUnavailable ? (
        <Text voice="gloss" id={unavailableId} data-slot="rpg-structured-unavailable">
          {STATE_CAPTURE_UNAVAILABLE}
        </Text>
      ) : null}
    </Stack>
  );
}
