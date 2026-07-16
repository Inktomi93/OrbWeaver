// RailButton — one rail affordance: an icon Button with a hover/focus tooltip carrying its label, which
// is also the button's accessible name. Visual states live in shell.css, keyed off `.shell-rail-button` +
// `data-active`, not inline utilities — except the focus-ring OFFSET COLOR, which must match the sidebar
// tone under the rail (Button's FOCUS_RING offsets to `background`); composing FOCUS_RING_ON_SIDEBAR
// tailwind-merges the offset to `--color-sidebar` (north-star PP3).

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { FOCUS_RING_ON_SIDEBAR } from "@orb/ui/lib";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";

export interface RailButtonProps {
  readonly label: string;
  readonly icon: LucideIcon;
  /** Active (current section) — Ember tint + `aria-current`. Modal triggers pass `false`. */
  readonly active?: boolean;
  readonly onClick: () => void;
}

export function RailButton({ label, icon, active = false, onClick }: RailButtonProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            intent="ghost"
            size="icon"
            aria-label={label}
            aria-current={active ? "page" : undefined}
            data-active={active ? "" : undefined}
            className={`shell-rail-button ${FOCUS_RING_ON_SIDEBAR}`}
            onClick={onClick}
          >
            <Icon icon={icon} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}
