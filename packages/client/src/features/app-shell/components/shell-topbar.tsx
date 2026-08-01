// ShellTopbar — the always-present strip above CONTENT. Shell-owned, section-agnostic chrome: the list
// panel toggle (frame grammar, positionally bound to the list panel — stays intrinsic), the active section
// title (or a per-section header node the route supplies), and the registry-driven `topbar.trail` zone
// (⌘K derived from the modal registry; the bell/focus/context toggles ride the chrome registry as
// widgets — shell-chrome-unification.md §A). Every icon button + the chip carries a Tooltip.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Icon, PanelLeftClose, PanelLeftOpen } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode } from "#state";

export interface ShellTopbarProps {
  readonly title: string;
  /** Per-section header node the route may supply (defaults to just the title). */
  readonly header?: ReactNode;
  /** The registry-derived `topbar.trail` zone render (⌘K + chrome widgets), rendered as-is. */
  readonly trail: ReactNode;
  readonly listMode: PanelMode;
  /** Does the active section HAVE a LIST pane? `false` ⇒ NO toggle renders (home-section-spec §4.4 / arm
   *  L-b) — a reachable toggle onto a surface that does not exist is the "looks unbuilt" defect. */
  readonly listAvailable: boolean;
  readonly onToggleList: () => void;
}

export interface TopbarIconButtonProps {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly onClick: () => void;
}

/** One tooltip-wrapped topbar icon button — the label is both the tooltip text AND the aria-label.
 *  Exported so the fullscreen/context-toggle chrome widgets (features/app-shell/lib) render the SAME
 *  affordance shape the list-panel toggle uses. */
export function TopbarIconButton({ label, icon, pressed, expanded, onClick }: TopbarIconButtonProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            intent="ghost"
            size="icon"
            className="shell-topbar-icon-btn"
            aria-label={label}
            aria-pressed={pressed}
            aria-expanded={expanded}
            onClick={onClick}
          >
            <Icon icon={icon} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side="bottom">{label}</TooltipPopup>
    </Tooltip>
  );
}

export function ShellTopbar({ title, header, trail, listMode, listAvailable, onToggleList }: ShellTopbarProps): ReactElement {
  const listCollapsed = listMode === "collapsed";
  return (
    <header className="shell-topbar">
      <div className="shell-topbar-lead">
        {listAvailable ? (
          <TopbarIconButton
            label={listCollapsed ? "Show list panel" : "Hide list panel"}
            icon={listCollapsed ? PanelLeftOpen : PanelLeftClose}
            expanded={!listCollapsed}
            onClick={onToggleList}
          />
        ) : null}
        {header ??
          (listCollapsed ? (
            <Text size="title" weight="semibold">
              {title}
            </Text>
          ) : null)}
      </div>

      <div className="shell-topbar-trail">{trail}</div>
    </header>
  );
}
