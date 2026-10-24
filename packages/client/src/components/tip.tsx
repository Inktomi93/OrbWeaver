// A hover and focus tooltip on one enabled control. The tooltip seal makes the text the control's
// aria-describedby description, or skips it when the text repeats the control's name. Never wrap a disabled
// control: its reason is visible copy (.claude/rules/ui-and-client.md).

import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ComponentProps, ReactElement } from "react";

export interface TipProps {
  /** `undefined` renders the control bare, for a tip that exists only in some states. */
  readonly text: string | undefined;
  /** The trigger: a focusable control, rendered in place of the tooltip trigger. */
  readonly children: ReactElement;
  /** @defaultValue "top" */
  readonly side?: ComponentProps<typeof TooltipPopup>["side"];
}

export function Tip({ text, children, side = "top" }: TipProps): ReactElement {
  if (text === undefined) {
    return children;
  }
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipPopup side={side}>{text}</TooltipPopup>
    </Tooltip>
  );
}
