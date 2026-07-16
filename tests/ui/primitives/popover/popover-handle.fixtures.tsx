// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the detached popover handle: a hidden
// trigger carries the payload, and `handle.open(triggerId)` opens the popover imperatively so the
// payload reaches the Root render-function children. API DELTA: popover handles have no
// openWithPayload — payload rides the trigger (see popover/handle.ts).
import { createPopoverHandle, Popover, PopoverDescription, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import type { ReactElement } from "react";
import { useId, useState } from "react";

export function PopoverHandleHarness(): ReactElement {
  const [handle] = useState(() => createPopoverHandle<string>());
  const triggerId = useId();
  return (
    <>
      <button
        onClick={(): void => {
          handle.open(triggerId);
        }}
        type="button"
      >
        Open remotely
      </button>
      <PopoverTrigger className="sr-only" handle={handle} id={triggerId} payload="Reached content">
        anchor
      </PopoverTrigger>
      <Popover handle={handle}>
        {({ payload }): ReactElement => (
          <PopoverPopup>
            <PopoverDescription>{payload ?? "no payload"}</PopoverDescription>
          </PopoverPopup>
        )}
      </Popover>
    </>
  );
}
