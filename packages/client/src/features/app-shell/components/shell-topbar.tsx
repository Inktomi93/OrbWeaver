// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph + LucideIcon fine
// (the table.tsx / status-chip.tsx precedent).

// ShellTopbar — the always-present strip above CONTENT (UI-Arch §4.1: HEADER bar). Shell-owned,
// section-agnostic chrome: the panel show/hide toggles (the REOPEN affordance for a collapsed panel —
// always visible, never off-screen), the active section title (or a per-section `header` node the route
// supplies — UIP-202: the active chat identity), the ⌘K jump chip, and the focus toggle. Group order
// (UIP-203): [list-toggle | title/identity] … [⌘K chip | focus | context-toggle]. Every icon button +
// the chip carries a Tooltip (labels also live as aria-labels — §4a WCAG baseline).

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
  /** Per-section header node the route may supply (defaults to just the title — UIP-202). */
  readonly header?: ReactNode;
  /** Route-composed TRAIL chrome (the notifications bell) — rendered first in the trail group, before
   *  the ⌘K chip. Section-agnostic, always-present chrome; the shell forwards a ReactNode slot and
   *  never imports a feature (the `railFoot` seam, §4.1). */
  readonly trail?: ReactNode;
  readonly listMode: PanelMode;
  readonly contextMode: PanelMode;
  /** Both panels collapsed = immersive-ST (UI-Arch §4.1) — drives the focus-toggle affordance. */
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
        {/* The section title is the FALLBACK when the route supplies no identity `header` (UIP-202). But a
            DOCKED/overlay list already labels the section with its OWN header row ("CHATS"), so repeating
            the word here is the double-title (#12). The plain title therefore shows ONLY when the list is
            COLLAPSED — the one state where the topbar is the sole place the section is named. A chat
            identity `header` always wins regardless of list mode. */}
        {header ??
          (listCollapsed ? (
            <Text size="title" weight="semibold">
              {title}
            </Text>
          ) : null)}
      </div>

      <div className="shell-topbar-trail">
        {/* Route-composed trail chrome (the notifications bell) — before the ⌘K chip so the shell's own
            controls keep their fixed tail order. */}
        {trail}
        {/* ⌘K jump chip (UIP-203) — a bordered pill (P5 `secondary`, muted until hover) with a kbd-styled
            shortcut + a "jump" label; opens the command modal. */}
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
