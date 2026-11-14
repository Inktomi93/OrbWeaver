import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { RAIL_FIRST_HINT, RAIL_FIRST_NAME, RAIL_PLAIN_NAME, RAIL_SECOND_HINT, RAIL_SECOND_NAME } from "./keyboard-focus-names.ts";

/** Two tooltipped controls side by side, as a rail lays its buttons, then a control with no tooltip. */
export function TooltipRailStory(): ReactElement {
  return (
    <CtIsolation subject="Tooltip" isolates="Keyboard focus moving between neighbouring controls needs no application services.">
      <Row>
        <Tooltip>
          <TooltipTrigger delay={0} render={<Button aria-label={RAIL_FIRST_NAME} />}>
            One
          </TooltipTrigger>
          <TooltipPopup>{RAIL_FIRST_HINT}</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger delay={0} render={<Button aria-label={RAIL_SECOND_NAME} />}>
            Two
          </TooltipTrigger>
          <TooltipPopup>{RAIL_SECOND_HINT}</TooltipPopup>
        </Tooltip>
        <Button aria-label={RAIL_PLAIN_NAME}>Three</Button>
      </Row>
    </CtIsolation>
  );
}
