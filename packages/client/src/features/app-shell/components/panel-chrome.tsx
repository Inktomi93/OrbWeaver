// PanelChrome — the wrapper for a side panel (LIST or CONTEXT). Renders the `.shell-panel` aside whose
// `data-panel-mode` drives the clamp-overlay (docked in-flow · overlay float · collapsed off-screen)
// entirely in shell.css — no width math in JS.
//
// The header is an optional ReactNode slot. The CONTEXT panel supplies one and gets a collapse control
// in that row. The LIST panel supplies none — its own list surface owns the section title, and its
// reopen/collapse affordance is the always-present topbar toggle.

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the status-chip.tsx precedent).
import { Icon, PanelLeftClose, PanelRightClose } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode, PanelName } from "#state";

export interface PanelChromeProps {
  readonly panel: PanelName;
  /** Accessible name for the panel's `complementary` landmark, distinguishing LIST from CONTEXT. */
  readonly label?: string;
  /** Header content. `undefined` renders no header row. */
  readonly header?: ReactNode;
  readonly collapseLabel?: string;
  /** The current mode — sets `data-panel-mode` (shell.css owns the transform/width per mode). */
  readonly mode: PanelMode;
  /** Collapse control — the header's close button. Omitted ⇒ no button. */
  readonly onCollapse?: () => void;
  readonly children: ReactNode;
}

export function PanelChrome({
  panel,
  label,
  header,
  collapseLabel,
  mode,
  onCollapse,
  children,
}: PanelChromeProps): ReactElement {
  const CollapseIcon = panel === "list" ? PanelLeftClose : PanelRightClose;
  return (
    <aside
      className="shell-panel"
      aria-label={label}
      data-panel-mode={mode}
      data-panel-side={panel}
      aria-hidden={mode === "collapsed" ? "true" : undefined}
      inert={mode === "collapsed" ? true : undefined}
    >
      {header === undefined ? null : (
        <header className="shell-panel-header">
          {header}
          {onCollapse === undefined ? null : (
            <Button
              intent="ghost"
              size="icon"
              aria-label={collapseLabel ?? "Collapse panel"}
              onClick={onCollapse}
            >
              <Icon icon={CollapseIcon} size="sm" />
            </Button>
          )}
        </header>
      )}
      <div className="shell-panel-body">{children}</div>
    </aside>
  );
}
