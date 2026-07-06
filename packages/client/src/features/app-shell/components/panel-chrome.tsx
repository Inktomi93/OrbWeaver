// PanelChrome — the wrapper for a side panel (LIST or CONTEXT). Renders the `.shell-panel` aside
// whose `data-panel-mode` drives the §11.1 clamp-overlay (docked in-flow · overlay float · collapsed
// `-translate-x-full`, zero width) entirely in shell.css — no width math in JS. The body scrolls
// (overscroll contained, §4b axis 4, in shell.css).
//
// HEADER (D62 UIP-202 — kill the triple title): the header is an OPTIONAL ReactNode slot. The CONTEXT
// panel supplies one (the entity detail header, or the "Details" fallback) and gets a collapse control
// in that row. The LIST panel supplies NONE (`header` undefined) — its own list surface owns the
// section title (UIP-301/302), and its REOPEN/collapse affordance is the always-present topbar toggle
// ("Hide/Show list panel"), so a translated-off panel is never the only way back.

import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the status-chip.tsx precedent).
import { Icon, PanelLeftClose, PanelRightClose } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode, PanelName } from "#state";

export interface PanelChromeProps {
  readonly panel: PanelName;
  /** Accessible name for the panel's `complementary` landmark — distinguishes the LIST aside from the
   *  CONTEXT aside for AT + Playwright/agent nav (`getByRole("complementary", { name })`). The route
   *  passes the section label for LIST and "Details" for CONTEXT. */
  readonly label?: string;
  /** Header content — an entity/detail header node. `undefined` renders NO header row (the LIST panel:
   *  its list surface owns the title, the topbar owns the collapse — UIP-202). */
  readonly header?: ReactNode;
  /** Accessible label for the panel's collapse button (only rendered when a header + `onCollapse` are). */
  readonly collapseLabel?: string;
  /** The current mode — sets `data-panel-mode` (shell.css owns the transform/width per mode). */
  readonly mode: PanelMode;
  /** Collapse control — the header's close button (topbar owns the reopen). Omitted ⇒ no button. */
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
      // A collapsed panel is translated off-screen: hide it from AT + the tab order so a keyboard
      // user never lands on an invisible control (§4a keyboard-operability baseline).
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
