// RailButton — one rail affordance: an icon Button with a hover/focus tooltip carrying its label
// (the label is ALSO the button's accessible name, so keyboard/AT users never depend on the visual
// tooltip — §4a WCAG baseline). Composed from @orb/ui primitives (Button · Tooltip · Icon) — app-shell
// paints the frame, the affordances stay primitive-composed.
//
// VISUAL STATES (D62 UIP-201) live in shell.css (the shell-tier painter), keyed off the `.shell-rail-
// button` class + the `data-active` attribute — NOT inline utilities: the fine-pointer 40px sizing
// (`--spacing-control-lg`), hover (`--sidebar-accent`), and active tint (`color-mix(primary 14%,
// transparent)` bg + primary icon — NOT a solid slab) are shell geometry/chrome. Focus rides the
// Button primitive's built-in 2px `--color-ring` offset-2 focus-visible ring.

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the status-chip.tsx precedent).
import type { LucideIcon } from "@orb/ui/icons";
// biome-ignore lint/correctness/noUnresolvedImports: same @orb/ui/icons resolver gap as above — tsc/vite resolve Icon fine.
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
