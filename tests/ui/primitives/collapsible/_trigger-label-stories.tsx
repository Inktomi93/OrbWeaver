import { CtIsolation } from "@orb/testkit/browser";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** A phone-width pane that scrolls sideways when something outgrows it, holding a disclosure whose label is longer than one line. */
export function TriggerLabelStory(): ReactElement {
  return (
    <CtIsolation subject="Collapsible" isolates="A long trigger label at enlarged text, without the settings pane around the disclosure">
      <Stack className="overflow-x-auto" data-probe="pane">
        <Collapsible>
          <CollapsibleTrigger>Customize this look and everything that rides on top of it</CollapsibleTrigger>
          <CollapsiblePanel>
            <Text as="p">The knobs behind the disclosure.</Text>
          </CollapsiblePanel>
        </Collapsible>
      </Stack>
    </CtIsolation>
  );
}
