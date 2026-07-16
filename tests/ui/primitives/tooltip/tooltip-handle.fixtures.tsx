// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome
// forbids exporting a component from a `.ct.tsx`). Exercises the detached tooltip handle: a hidden
// trigger carries the payload, and `handle.open(triggerId)` opens the tooltip imperatively so the
// payload reaches the Root render-function children. API DELTA: tooltip handles have no
// openWithPayload — payload rides the trigger (see tooltip/handle.ts).
import { createTooltipHandle, Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useId, useState } from "react";

export function TooltipHandleHarness(): ReactElement {
  const [handle] = useState(() => createTooltipHandle<string>());
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
      <TooltipTrigger className="sr-only" handle={handle} id={triggerId} payload="Reached content">
        anchor
      </TooltipTrigger>
      <Tooltip handle={handle}>{({ payload }): ReactElement => <TooltipPopup>{payload ?? "no payload"}</TooltipPopup>}</Tooltip>
    </>
  );
}
