// The ACTIONS view's CONTEXT readout (preset-surface-redesign.md §7): the DELIVERY PATH.
//
// The question it answers is the one the Actions view itself cannot: "will my customized template
// actually LAND, and where in the prompt?" A guided steer rides the `guided_instruction` MARKER — if that
// marker is off, or was never placed, every template in the list is a well-written string that goes
// nowhere. The §6 cross-link is therefore PROMOTED here from a chip you have to notice into a standing
// readout, with its health, its zone, and its position in the current arrangement.
//
// The marker-name click is a sanctioned SELECTION echo (§16 row 19) through the ONE store action — it
// selects the marker's rack row, so switching to Prompt lands you on it.

import type { PromptSection } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { selectPresetSection } from "#state";
import { deriveZones } from "../prompt-assembly/derive-zones";
import { DatumRow } from "./readout-parts";

export interface ActionsReadoutProps {
  readonly sections: readonly PromptSection[];
}

export function ActionsReadout({ sections }: ActionsReadoutProps): ReactElement {
  const index = sections.findIndex((section) => section.type === "marker" && section.marker === "guided_instruction");
  const marker = index === -1 ? undefined : sections[index];
  if (marker === undefined) {
    return (
      <Section kicker="Delivery path">
        <Row align="center" gap="field">
          <Text voice="label">Guided instruction</Text>
          <Badge intent="warning" size="sm">
            absent
          </Badge>
        </Row>
        <Text voice="gloss">
          No Guided instruction marker is placed, so a steer has nowhere to land — every template below resolves and is then dropped. Add the marker from the
          rack's Add menu in the Prompt view.
        </Text>
      </Section>
    );
  }
  const zones = deriveZones(sections);
  return (
    <Section kicker="Delivery path">
      <Row align="center" gap="field">
        <Button intent="ghost" onClick={(): void => selectPresetSection(marker.id)} size="sm" type="button">
          <Text voice="label">Guided instruction</Text>
        </Button>
        <Badge intent={marker.enabled ? "success" : "warning"} size="sm">
          {marker.enabled ? "on" : "off"}
        </Badge>
      </Row>
      <Stack gap="tight">
        <DatumRow label="position" value={`${zones.zoneOf(index).toUpperCase()} · ${String(index + 1)} of ${String(sections.length)}`} />
        <DatumRow label="delivered as" value={marker.role} />
      </Stack>
      <Text voice="gloss">
        {marker.enabled
          ? "Clicking the name selects that row in Prompt."
          : "The marker is switched OFF — a steer resolves and is then dropped. Turn it back on from its rack row."}
      </Text>
    </Section>
  );
}
