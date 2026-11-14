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
import type { CSSProperties, ReactElement } from "react";
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
              <PopoverTitle>Sample details</PopoverTitle>
              <PopoverDescription>{payload}</PopoverDescription>
              <PopoverClose>Done</PopoverClose>
            </PopoverViewport>
          </PopoverPopup>
        )}
      </Popover>
    </CtIsolation>
  );
}

export function PopoverStyleStory({ stable = false, callback = true }: { readonly stable?: boolean; readonly callback?: boolean }): ReactElement {
  return (
    <CtIsolation subject="Popover style" isolates="Native style callback state and the seal's stable-width composition">
      <Popover>
        <PopoverTrigger>Open styled popup</PopoverTrigger>
        <PopoverPopup
          {...(stable ? ({ width: "stable" } as const) : {})}
          style={callback ? (state): CSSProperties => ({ opacity: state.open ? 0.6 : 0, width: 1 }) : { opacity: 0.6 }}
        >
          <PopoverTitle>Styled popup</PopoverTitle>
          <PopoverClose>Close styled popup</PopoverClose>
        </PopoverPopup>
      </Popover>
    </CtIsolation>
  );
}
