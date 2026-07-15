// RailButton — one rail affordance: an icon Button with a hover/focus tooltip carrying its label, which
// is also the button's accessible name. Visual states live in shell.css, keyed off `.shell-rail-button` +
// `data-active`, not inline utilities.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";

export interface RailButtonProps {
  readonly label: string;
  readonly icon: LucideIcon;
  /** Active (current section) — Ember tint + `aria-current`. Modal triggers pass `false`. */
  readonly active?: boolean;
  readonly onClick: () => void;
}

export function RailButton({
  label,
  icon,
  active = false,
  onClick,
}: RailButtonProps): ReactElement {
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
            className="shell-rail-button"
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
