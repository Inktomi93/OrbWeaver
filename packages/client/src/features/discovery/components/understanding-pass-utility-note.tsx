// Which model the understanding pass runs on, said before it runs, by both of its doors (the invitation and the
// readiness rail's re-run): the Utility model by name and whether it reads the pictures art archetypes need, or that
// none is ready, beside the door to Model roles. Silent while the Utility read settles.

import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { useUtilityModel } from "#components";
import { UtilityModelDoor } from "#components";

export function UnderstandingPassUtilityNote({
  id,
  utility,
}: {
  /** The note's id, which a door disabled for want of a Utility model names as its description. */
  readonly id: string;
  readonly utility: ReturnType<typeof useUtilityModel>;
}): ReactElement | null {
  if (utility.kind === "unknown") {
    return null;
  }
  if (utility.kind === "ready") {
    return (
      <Text data-slot="understanding-pass-utility" id={id} voice="gloss">
        {utility.readsImages
          ? `It runs on your helper model, ${utility.label}, which can also read pictures.`
          : `It runs on your helper model, ${utility.label}. Grouping by art needs a model that reads pictures, and this one can't.`}
      </Text>
    );
  }
  return (
    <Row align="center" className="flex-wrap" data-slot="understanding-pass-utility" gap="field">
      <Text id={id} voice="gloss">
        {utility.kind === "unset" ? "This needs a helper model — pick one in Model roles." : `Your helper model is set but not running: ${utility.cause}.`}
      </Text>
      <UtilityModelDoor />
    </Row>
  );
}
