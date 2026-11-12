// A one-line title that can be cut by its row still says all of itself. `TitleReveal` is the press-opened arm, for a title that is plain
// text: while a part marked `CUT_PART` inside it is cut, the title becomes the control that opens its whole text, so touch and keyboard
// reach it too (a tooltip opens on neither). `TitleTip` is the hover arm for a title that is already a control. Both leave the title
// untouched while nothing is cut, so a title that fits carries no extra control, and neither shrinks the title under its floor: the
// floor belongs to the row, and the trigger adds no padding of its own.

import { InlineAction } from "@orb/ui/inline-action";
import { Contents } from "@orb/ui/layout";
import { Popover, PopoverPopup, PopoverTrigger } from "@orb/ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import { useRef } from "react";
import { useIsCut } from "./use-is-cut.ts";

export interface TitleRevealProps {
  /** The whole title: the trigger's name when it is cut, and the text the popup prints. */
  readonly whole: string;
  /** The title fills the room its row gives it, so the trigger that replaces it fills that room too and takes the floor the title carries. */
  readonly fill?: boolean;
  readonly children: ReactNode;
}

export function TitleReveal({ whole, fill = false, children }: TitleRevealProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const cut = useIsCut(ref);
  return (
    <Contents data-slot="title-reveal" ref={ref}>
      {cut ? (
        <Popover>
          <PopoverTrigger render={<InlineAction grow={fill} step="label" type="button" />}>{children}</PopoverTrigger>
          <PopoverPopup aria-label={whole} side="bottom">
            {whole}
          </PopoverPopup>
        </Popover>
      ) : (
        children
      )}
    </Contents>
  );
}

export interface TitleTipProps {
  /** The whole title the tooltip prints. */
  readonly whole: string;
  /** The control the title already is, rendered as the tooltip's trigger. */
  readonly children: ReactElement;
}

export function TitleTip({ whole, children }: TitleTipProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const cut = useIsCut(ref);
  return (
    <Contents data-slot="title-reveal" ref={ref}>
      <Tooltip disabled={!cut}>
        <TooltipTrigger render={children} />
        <TooltipPopup side="bottom">{whole}</TooltipPopup>
      </Tooltip>
    </Contents>
  );
}
