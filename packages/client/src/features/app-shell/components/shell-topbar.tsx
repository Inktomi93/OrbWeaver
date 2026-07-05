// biome-ignore-all lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react
// re-export chain behind the @orb/ui/icons subpath; tsc + vite resolve every glyph fine (the
// table.tsx / status-chip.tsx precedent).

// ShellTopbar — the always-present strip above CONTENT (UI-Arch §4.1: HEADER bar). Shell-owned,
// section-agnostic chrome: it renders the panel show/hide toggles (the REOPEN affordance for a
// collapsed panel — always visible, never off-screen) + the active section title (or a per-section
// header node the route supplies) + the ⌘K command trigger. Character/scene chip is absent, not
// fabricated — no client data feeds it yet (the mockup's chip is design intent, wired later).

import { Button } from "@orb/ui/button";
import {
  Expand,
  Icon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Shrink,
} from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode } from "#state";
import { COMMAND_ACTION } from "../lib/rail-slots";

export interface ShellTopbarProps {
  readonly title: string;
  /** Per-section header node the route may supply (defaults to just the title). */
  readonly header?: ReactNode;
  readonly listMode: PanelMode;
  readonly contextMode: PanelMode;
  /** Both panels collapsed = immersive-ST (UI-Arch §4.1) — drives the focus-toggle affordance. */
  readonly immersive: boolean;
  readonly onToggleList: () => void;
  readonly onToggleContext: () => void;
  readonly onToggleFocus: () => void;
  readonly onOpenCommand: () => void;
}

export function ShellTopbar({
  title,
  header,
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
        <Button
          intent="ghost"
          size="icon"
          aria-label={listCollapsed ? "Show list panel" : "Hide list panel"}
          aria-pressed={!listCollapsed}
          onClick={onToggleList}
        >
          <Icon icon={listCollapsed ? PanelLeftOpen : PanelLeftClose} size="sm" />
        </Button>
        {header ?? (
          <Text size="title" weight="semibold">
            {title}
          </Text>
        )}
      </div>

      <div className="shell-topbar-trail">
        <Button
          intent="ghost"
          size="icon"
          aria-label={immersive ? "Exit focus mode" : "Enter focus mode"}
          aria-pressed={immersive}
          onClick={onToggleFocus}
        >
          <Icon icon={immersive ? Shrink : Expand} size="sm" />
        </Button>
        <Button intent="ghost" size="sm" aria-label="Command menu" onClick={onOpenCommand}>
          <Icon icon={COMMAND_ACTION.icon} size="sm" />
          <Text as="span" size="label" tone="muted">
            ⌘K
          </Text>
        </Button>
        <Button
          intent="ghost"
          size="icon"
          aria-label={contextCollapsed ? "Show detail panel" : "Hide detail panel"}
          aria-pressed={!contextCollapsed}
          onClick={onToggleContext}
        >
          <Icon icon={contextCollapsed ? PanelRightOpen : PanelRightClose} size="sm" />
        </Button>
      </div>
    </header>
  );
}
