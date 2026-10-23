import { CtIsolation } from "@orb/testkit/browser/ct-isolated-subject.tsx";
import { Button } from "@orb/ui/button";
import { createTooltipHandle, Tooltip, TooltipArrow, TooltipPopup, TooltipTrigger, TooltipViewport } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useId, useState } from "react";

export function TooltipDescriptionStory(): ReactElement {
  const hintId = useId();
  return (
    <CtIsolation subject="Tooltip" isolates="The description copy and native portal context require no application services.">
      <span id={hintId}>Also mentioned elsewhere</span>
      <Tooltip>
        <TooltipTrigger aria-describedby={hintId} delay={0}>
          Regenerate
        </TooltipTrigger>
        <TooltipPopup>
          <TooltipArrow />
          <TooltipViewport>Regenerate the last reply</TooltipViewport>
        </TooltipPopup>
      </Tooltip>
      <Button>Outside tooltip</Button>
    </CtIsolation>
  );
}

export function TooltipHandleStory(): ReactElement {
  const [handle] = useState(() => createTooltipHandle<string>());
  const triggerId = useId();
  return (
    <CtIsolation subject="Tooltip" isolates="Native anchored handle payload delivery is independent of application data.">
      <Button onClick={(): void => handle.open(triggerId)}>Open remotely</Button>
      <TooltipTrigger delay={0} handle={handle} id={triggerId} payload="Character details">
        Characters
      </TooltipTrigger>
      <TooltipTrigger delay={0} handle={handle} payload="Room details">
        Rooms
      </TooltipTrigger>
      <Tooltip handle={handle}>
        {({ payload }): ReactElement => (
          <TooltipPopup>
            <TooltipViewport>{payload}</TooltipViewport>
          </TooltipPopup>
        )}
      </Tooltip>
      <Button onClick={(): void => handle.close()}>Close remotely</Button>
    </CtIsolation>
  );
}
