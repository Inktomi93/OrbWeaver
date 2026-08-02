// The ACTIONS view's CONTEXT readout (preset-surface-redesign.md §7): the DELIVERY PATH.
//
// The question it answers is the one the Actions view itself cannot: "will my customized template
// actually LAND, and where in the prompt?" A guided steer rides the `guided_instruction` MARKER — if that
// marker is off, or was never placed, every template in the list is a well-written string that goes
// nowhere. The §6 cross-link is therefore PROMOTED here from a chip you have to notice into a standing
// readout, with its health, its zone, and its position in the current arrangement.
//
// The marker-name click is a sanctioned NAVIGATION echo (§16 row 19) through `openSectionInPrompt` — the
// ONE cross-view section door: it switches to the PROMPT view AND selects the marker's rack row, which is
// exactly what this panel's own note promises. Selecting alone left the reader in Actions with nothing
// visibly changed (crunch-list O-13).
//
// THE BINDING + RESOLVED PREVIEW ARE NOT BUILT YET (D8 / §7.1) and the panel says so rather than leaving
// the space blank (crunch item 12): an empty pane reads as an unbuilt product, while a named
// not-yet-arrived arm reads as a promise with a condition on it ([[empty-states-are-load-bearing]]).

import type { PromptSection } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { openSectionInPrompt } from "../../lib/preset-nav";
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
      <Stack gap="section">
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
        <ResolvedPreviewArm />
      </Stack>
    );
  }
  const zones = deriveZones(sections);
  return (
    <Stack gap="section">
      <Section kicker="Delivery path">
        <Row align="center" gap="field">
          <Button intent="ghost" onClick={(): void => openSectionInPrompt(marker.id)} size="sm" type="button">
            <Text voice="label">Guided instruction</Text>
          </Button>
          <Badge intent={marker.enabled ? "success" : "warning"} size="sm">
            {marker.enabled ? "on" : "off"}
          </Badge>
        </Row>
        <Stack gap="tight">
          <DatumRow label="position" value={`${zones.zoneOf(index).toUpperCase()} · ${String(index + 1)} of ${String(sections.length)}`} />
          {/* ONE VOCABULARY with both drill-ins (O-10★): the field is "Role" there, so the datum is `role`
              here — "delivered as" was the third spelling of one thing. */}
          <DatumRow label="role" value={marker.role} />
        </Stack>
        <Text voice="gloss">
          {marker.enabled
            ? "Clicking the name opens that row in Prompt."
            : "The marker is switched OFF — a steer resolves and is then dropped. Turn it back on from its rack row."}
        </Text>
      </Section>
      <ResolvedPreviewArm />
    </Stack>
  );
}

/** THE HONEST NOT-YET ARM (crunch item 12). The chat BINDING (§7.1 / D8) and the resolved template preview
 *  it feeds are queued post-P5; until they land this panel is one small cluster in a tall pane, and blank
 *  space below a built cluster reads as a broken panel rather than a pending one. It names WHAT arrives and
 *  the CONDITION that brings it — never a spinner, never a `{planned}` marker on nothing. */
function ResolvedPreviewArm(): ReactElement {
  return (
    <Section kicker="Resolved preview">
      <Text prose={true} voice="gloss">
        Bind a chat to this preset and the resolved template — your steer already substituted, macros already rendered — appears here beside the delivery path.
        Nothing is bound yet, so there is nothing to resolve against.
      </Text>
    </Section>
  );
}
