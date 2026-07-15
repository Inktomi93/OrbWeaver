// PanelChrome — the wrapper for a side panel (LIST or CONTEXT). Renders the `.shell-panel` aside whose
// `data-panel-mode` drives the clamp-overlay (docked in-flow · overlay float · collapsed off-screen)
// entirely in shell.css — no width math in JS.
//
// The header is an optional ReactNode slot. Neither panel supplies a collapse control here — the
// CONTEXT panel's open/close affordance is the registered `contextToggleChrome` topbar widget (the ONE
// detail-panel close control, shell-chrome-unification.md §A); the LIST panel's is the topbar's
// intrinsic list toggle.

import type { ReactElement, ReactNode } from "react";
import type { PanelMode, PanelName } from "#state";

export interface PanelChromeProps {
  readonly panel: PanelName;
  /** Accessible name for the panel's `complementary` landmark, distinguishing LIST from CONTEXT. */
  readonly label?: string;
  /** Header content. `undefined` renders no header row. */
  readonly header?: ReactNode;
  /** The current mode — sets `data-panel-mode` (shell.css owns the transform/width per mode). */
  readonly mode: PanelMode;
  readonly children: ReactNode;
}

export function PanelChrome({
  panel,
  label,
  header,
  mode,
  children,
}: PanelChromeProps): ReactElement {
  return (
    <aside
      className="shell-panel"
      aria-label={label}
      data-panel-mode={mode}
      data-panel-side={panel}
      aria-hidden={mode === "collapsed" ? "true" : undefined}
      inert={mode === "collapsed" ? true : undefined}
    >
      {header === undefined ? null : <header className="shell-panel-header">{header}</header>}
      <div className="shell-panel-body">{children}</div>
    </aside>
  );
}
