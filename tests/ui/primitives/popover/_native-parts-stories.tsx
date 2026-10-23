import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import {
  createPopoverHandle,
  Popover,
  PopoverArrow,
  PopoverClose,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
  PopoverViewport,
} from "@orb/ui/popover";
import type { ReactElement } from "react";
import { useId, useState } from "react";

export function PopoverNativePartsStory(): ReactElement {
  const [handle] = useState(() => createPopoverHandle<string>());
  const triggerId = useId();
  return (
    <CtIsolation subject="Popover" isolates="Detached payloads and native accessible popup parts are domain independent.">
      <Button onClick={(): void => handle.open(triggerId)}>Open remotely</Button>
      <PopoverTrigger handle={handle} id={triggerId} payload="Character details">
        Characters
      </PopoverTrigger>
      <PopoverTrigger handle={handle} payload="Room details">
        Rooms
      </PopoverTrigger>
      <Popover handle={handle}>
        {({ payload }): ReactElement => (
          <PopoverPopup>
            <PopoverArrow />
            <PopoverViewport>
              <PopoverTitle>Details</PopoverTitle>
              <PopoverDescription>{payload}</PopoverDescription>
              <PopoverClose>Done</PopoverClose>
            </PopoverViewport>
          </PopoverPopup>
        )}
      </Popover>
    </CtIsolation>
  );
}
