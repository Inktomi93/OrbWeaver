// The one plain switch for image input, mounted by the add dialogs' limits step and the connection editor. It is a view
// over the `takes` fact the Advanced tier lists (`connection-capability-fact-model.ts::imageInputSwitch`), so a change
// here shows in that row and the reverse; the caller owns the write.

import { Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import type { ImageInputSwitch } from "../lib/connection-capability-fact-model.ts";
import {
  IMAGE_SWITCH_ASSUMED_GLOSS,
  IMAGE_SWITCH_ASSUMED_OFF_GLOSS,
  IMAGE_SWITCH_NAME,
  IMAGE_SWITCH_STATED_GLOSS,
  imageSwitchSetGloss,
} from "../lib/credentials-names.ts";

export interface ConnectionImageSwitchProps {
  readonly answer: ImageInputSwitch;
  /** The state the switch shows; the step holds a draft, the editor passes the stored answer. */
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

function glossOf({ on, provenance, was }: ImageInputSwitch): string {
  switch (provenance) {
    case "assumed":
      return on ? IMAGE_SWITCH_ASSUMED_GLOSS : IMAGE_SWITCH_ASSUMED_OFF_GLOSS;
    case "set":
      return imageSwitchSetGloss(was);
    case "stated":
      return IMAGE_SWITCH_STATED_GLOSS;
  }
}

export function ConnectionImageSwitch({ answer, checked, disabled, onCheckedChange }: ConnectionImageSwitchProps): ReactElement {
  // The gloss says whether the state is a guess, so it describes the switch: a screen reader hears it with the state.
  const glossId = useId();
  return (
    <Row align="start" data-slot="connection-image-switch" gap="field" justify="between">
      <Stack grow="fill" gap="tight" minWidth="shrinks">
        <Text voice="label">{IMAGE_SWITCH_NAME}</Text>
        <Text id={glossId} voice="gloss">
          {glossOf(answer)}
        </Text>
      </Stack>
      <Switch
        aria-describedby={glossId}
        aria-label={IMAGE_SWITCH_NAME}
        checked={checked}
        className="shrink-0"
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </Row>
  );
}
