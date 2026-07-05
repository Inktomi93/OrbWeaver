// PanelChrome — the wrapper for a side panel (LIST or CONTEXT). Renders the `.shell-panel` aside
// whose `data-panel-mode` drives the §11.1 clamp-overlay (docked in-flow · overlay float · collapsed
// `-translate-x-full`, zero width) entirely in shell.css — no width math in JS. A header carries the
// title + a collapse control; the body scrolls (overscroll contained, §4b axis 4, in shell.css). The
// REOPEN affordance for a collapsed panel lives in the always-present topbar, so a translated-off
// panel is never the only way back.

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the status-chip.tsx precedent).
import { Icon, PanelLeftClose, PanelRightClose } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode, PanelName } from "#state";

export interface PanelChromeProps {
  readonly panel: PanelName;
  readonly title: string;
  /** The current mode — sets `data-panel-mode` (shell.css owns the transform/width per mode). */
  readonly mode: PanelMode;
  /** Collapse control — the header's close button (topbar owns the reopen). */
  readonly onCollapse: () => void;
  readonly children: ReactNode;
}

export function PanelChrome({
  panel,
  title,
  mode,
  onCollapse,
  children,
}: PanelChromeProps): ReactElement {
  const CollapseIcon = panel === "list" ? PanelLeftClose : PanelRightClose;
  return (
    <aside
      className="shell-panel"
      data-panel-mode={mode}
      data-panel-side={panel}
      // A collapsed panel is translated off-screen: hide it from AT + the tab order so a keyboard
      // user never lands on an invisible control (§4a keyboard-operability baseline).
      aria-hidden={mode === "collapsed" ? "true" : undefined}
      inert={mode === "collapsed" ? true : undefined}
    >
      <header className="shell-panel-header">
        <Text size="label" weight="medium" tone="muted">
          {title}
        </Text>
        <Button
          intent="ghost"
          size="icon"
          aria-label={`Collapse ${title} panel`}
          onClick={onCollapse}
        >
          <Icon icon={CollapseIcon} size="sm" />
        </Button>
      </header>
      <div className="shell-panel-body">{children}</div>
    </aside>
  );
}
