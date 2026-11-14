import { CtIsolation } from "@orb/testkit/browser";
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@orb/ui/accordion";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";

/** The one word the tooltip and the toggle cells carry: no space to break at, and wider than a phone column at enlarged text. */
export const LONG_WORD = "Incomprehensibilities";

/** An open accordion panel holding a control that fills its inline size, so the control's focus ring is flush with the panel's inline edges. */
export function AccordionEdgeStory(): ReactElement {
  return (
    <CtIsolation
      subject="Accordion"
      isolates="The open panel's clip against the focus ring of a control flush with its inline edge, without a feature around it"
    >
      <Stack className="px-row" data-probe="pane">
        <Accordion defaultValue={["voice"]}>
          <AccordionItem value="voice">
            <AccordionHeader>
              <AccordionTrigger>Voice options</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>
              <Stack gap="row">
                <Text as="p">Pick the voice that reads the reply aloud.</Text>
                <Button variant="outline" width="full" data-probe="edge">
                  Choose a voice
                </Button>
                <Text as="p">Changing it takes effect on the next reply.</Text>
              </Stack>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Stack>
    </CtIsolation>
  );
}

/** A tooltip whose text is one word longer than the popup's measure at enlarged text. */
export function TooltipLongWordStory(): ReactElement {
  return (
    <CtIsolation subject="Tooltip" isolates="The popup's line breaking for a word wider than its measure, without a feature around the trigger">
      <Tooltip>
        <TooltipTrigger delay={0}>Explain</TooltipTrigger>
        <TooltipPopup>{LONG_WORD}</TooltipPopup>
      </Tooltip>
    </CtIsolation>
  );
}

/** A strip of equal cells in a phone-wide column, each cell one long word. */
export function ToggleGroupFillStory(): ReactElement {
  return (
    <CtIsolation subject="ToggleGroup" isolates="The equal-cell strip against its column when a cell's label is one word wider than its share">
      <Stack data-probe="column">
        <ToggleGroup aria-label="View mode" fill={true}>
          <Toggle value="one">{LONG_WORD}</Toggle>
          <Toggle value="two">{LONG_WORD}</Toggle>
        </ToggleGroup>
      </Stack>
    </CtIsolation>
  );
}
