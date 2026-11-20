import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** An open panel holding a control that fills its inline size, with a line of copy above and below so only the inline edges are flush. */
export function PanelEdgeStory(): ReactElement {
  return (
    <CtIsolation
      subject="Collapsible"
      isolates="The open panel's clip against the focus ring of a control flush with its inline edge, without a feature around it"
    >
      <Stack className="px-row" data-probe="pane">
        <Collapsible defaultOpen={true}>
          <CollapsibleTrigger>Voice options</CollapsibleTrigger>
          <CollapsiblePanel offset="row">
            <Stack gap="row">
              <Text as="p">Pick the voice that reads the reply aloud.</Text>
              <Button variant="outline" width="full" data-probe="edge">
                Choose a voice
              </Button>
              <Text as="p">Changing it takes effect on the next reply.</Text>
            </Stack>
          </CollapsiblePanel>
        </Collapsible>
      </Stack>
    </CtIsolation>
  );
}
