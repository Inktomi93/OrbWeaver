// ShellTopbar — the always-present strip above CONTENT. Shell-owned, section-agnostic chrome: panel
// show/hide toggles, the active section title (or a per-section header node the route supplies), the ⌘K
// jump chip, and the focus toggle. Every icon button + the chip carries a Tooltip.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import {
  Expand,
  Icon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Shrink,
} from "@orb/ui/icons";
import { Kbd } from "@orb/ui/kbd";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode } from "#state";

export interface ShellTopbarProps {
  readonly title: string;
  /** Per-section header node the route may supply (defaults to just the title). */
  readonly header?: ReactNode;
  /** Route-composed trail chrome (the notifications bell), rendered before the ⌘K chip. */
  readonly trail?: ReactNode;
  readonly listMode: PanelMode;
  readonly contextMode: PanelMode;
  /** Both panels collapsed — drives the focus-toggle affordance. */
  readonly immersive: boolean;
  readonly onToggleList: () => void;
  readonly onToggleContext: () => void;
  readonly onToggleFocus: () => void;
  readonly onOpenCommand: () => void;
}

interface TopbarIconButtonProps {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly onClick: () => void;
}

/** One tooltip-wrapped topbar icon button — the label is both the tooltip text AND the aria-label. */
function TopbarIconButton({
  label,
  icon,
  pressed,
  expanded,
  onClick,
}: TopbarIconButtonProps): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            intent="ghost"
            size="icon"
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

export function ShellTopbar({
  title,
  header,
  trail,
  listMode,
  contextMode,
  immersive,
  onToggleList,
  onToggleContext,
  onToggleFocus,
  onOpenCommand,
}: ShellTopbarProps): ReactElement {
  const listCollapsed = listMode === "collapsed";
  const contextCollapsed = contextMode === "collapsed";
  return (
    <header className="shell-topbar">
      <div className="shell-topbar-lead">
        <TopbarIconButton
          label={listCollapsed ? "Show list panel" : "Hide list panel"}
          icon={listCollapsed ? PanelLeftOpen : PanelLeftClose}
          expanded={!listCollapsed}
          onClick={onToggleList}
        />
        {header ??
          (listCollapsed ? (
            <Text size="title" weight="semibold">
              {title}
            </Text>
          ) : null)}
      </div>

      <div className="shell-topbar-trail">
        {trail}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                intent="secondary"
                size="sm"
                aria-label="Command menu"
                onClick={onOpenCommand}
              >
                <Kbd>⌘K</Kbd>
                <Text as="span" size="micro" tone="muted">
                  jump
                </Text>
              </Button>
            }
          />
          <TooltipPopup side="bottom">Jump to…</TooltipPopup>
        </Tooltip>
        <TopbarIconButton
          label={immersive ? "Exit focus mode" : "Enter focus mode"}
          icon={immersive ? Shrink : Expand}
          pressed={immersive}
          onClick={onToggleFocus}
        />
        <TopbarIconButton
          label={contextCollapsed ? "Show detail panel" : "Hide detail panel"}
          icon={contextCollapsed ? PanelRightOpen : PanelRightClose}
          expanded={!contextCollapsed}
          onClick={onToggleContext}
        />
      </div>
    </header>
  );
}
