// RailButton — one rail affordance for BOTH regimes (the merged desktop icon button + mobile tab, after
// the §E-3 single-DOM cutover). One <button> carrying an icon + a label: shell.css shows the label under
// the icon on the mobile bottom bar and hides it on the desktop icon column (the tooltip carries it there
// instead). `aria-label` is the accessible name in BOTH regimes — the desktop label is `display:none`, so
// it contributes nothing to the name, and it never conflicts with the visible mobile label (same string).
// Visual states live in shell.css keyed off `.shell-rail-button` + `data-active`/`data-mobile`, not inline
// utilities — except the focus-ring OFFSET COLOR, which must match the sidebar tone under the rail
// (Button's FOCUS_RING offsets to `background`); composing FOCUS_RING_ON_SIDEBAR tailwind-merges the
// offset to `--color-sidebar` (north-star PP3).

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon } from "@orb/ui/icons";
import { FOCUS_RING_ON_SIDEBAR } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import type { MobileCuration, ModalSlotId } from "#state";

export interface RailButtonProps {
  readonly label: string;
  readonly icon: LucideIcon;
  /** Active (current section) — Ember tint + `aria-current="page"`. Modal/footer triggers pass `false`. */
  readonly active?: boolean;
  readonly onClick: () => void;
  /** The entry's mobile fate — `"sheet"` entries are `display:none` on the mobile bar (folded into the
   *  You sheet); `"tab"` entries stay. Desktop shows every entry regardless. Defaults to `"sheet"`. */
  readonly mobile?: MobileCuration;
  /** The mobile-only "You" overflow tab — `display:none` on the desktop icon column, shown on the bar. */
  readonly mobileOnly?: boolean;
  /** An optional signal riding the control — the You tab's unread count for the widgets its sheet hosts
   *  (`sheetOverflowChrome`). Rendered inside the button beside the icon, exactly where the desktop bell
   *  puts its own badge. */
  readonly badge?: ReactNode;
  /** The registry-owned modal this affordance opens, when it is a modal trigger. */
  readonly modalId?: ModalSlotId;
}

export function RailButton({ label, icon, active = false, onClick, mobile = "sheet", mobileOnly = false, badge, modalId }: RailButtonProps): ReactElement {
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
            data-mobile={mobile}
            data-modal-trigger={modalId}
            data-rail-mobile-only={mobileOnly ? "" : undefined}
            className={`shell-rail-button ${FOCUS_RING_ON_SIDEBAR}`}
            onClick={onClick}
          >
            <Icon icon={icon} size="sm" />
            {badge}
            {/* `label` (13px), not `micro` (10.5px): this string is the PRIMARY name of a primary-nav
                control on the phone bar, and `micro` is the ramp's kicker/gloss step — a caps section
                name or a quiet second line, never a control's own name. 10.5px also sits under the
                design-audit interactive-text floor (11px, `undersized-ui-text` ×4 on the home route at
                coarse pointer, issue #86 lead 3), and the ramp has no step between the two (D5 refused an
                11px step). `size`, not `voice="label"` — voice would pin the ink to `text-foreground` and
                kill the muted/active colour states shell.css owns. */}
            <Text as="span" size="label" className="shell-rail-button-label">
              {label}
            </Text>
          </Button>
        }
      />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}
