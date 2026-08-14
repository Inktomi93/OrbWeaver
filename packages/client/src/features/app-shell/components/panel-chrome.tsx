// PanelChrome — the wrapper for a side panel (LIST or CONTEXT). Renders the `.shell-panel` aside whose
// `data-panel-mode` drives the clamp-overlay (docked in-flow · overlay float · collapsed off-screen)
// entirely in shell.css — no width math in JS.
//
// The `.shell-panel-header` band ALWAYS renders (D66 A1, ui-cohesion-north-star §4 N1): both panels carry
// a chrome-row-tall band on the one shared horizon, even when a panel supplies no `header` content —
// the band is the BASELINE (the LIST surface's title/action move INTO it at N2). `header` content is an
// optional slot the band wraps.
//
// In its DOCKED and COLLAPSED modes neither panel supplies a collapse control here — the CONTEXT panel's
// open/close affordance is the registered `contextToggleChrome` topbar widget (the ONE detail-panel close
// control, shell-chrome-unification.md §A); the LIST panel's is the topbar's intrinsic list toggle.
//
// AN OVERLAY IS DIFFERENT AND CARRIES ITS OWN DISMISS (side-eye 2026-08-06 P2). A floating panel's only
// exits were the scrim and Escape — and on a phone the panel is 100dvw, so the scrim it floats over has NO
// reachable pixel and Escape needs a keyboard. That left the topbar toggle as the sole way out: a control
// somewhere else, for a surface that is covering the screen. The band already exists on the one shared
// chrome horizon, so the close sits where the thing it closes is.

import { Button } from "@orb/ui/button";
import { Icon, X } from "@orb/ui/icons";
import type { ReactElement, ReactNode } from "react";
import type { PanelMode, PanelName } from "#state";

export interface PanelChromeProps {
  readonly panel: PanelName;
  /** Accessible name for the panel's `complementary` landmark, distinguishing LIST from CONTEXT. */
  readonly label?: string;
  /** Header content the always-present band wraps. `undefined` renders the band empty-but-present (the
   *  baseline horizon — D66 A1). */
  readonly header?: ReactNode;
  /** The current mode — sets `data-panel-mode` (shell.css owns the transform/width per mode). */
  readonly mode: PanelMode;
  /** Close THIS panel — the band's own dismiss, rendered only while the panel FLOATS (see the header). */
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}

export function PanelChrome({ panel, label, header, mode, onDismiss, children }: PanelChromeProps): ReactElement {
  return (
    <aside
      className="shell-panel"
      aria-label={label}
      data-panel-mode={mode}
      data-panel-side={panel}
      aria-hidden={mode === "collapsed" ? "true" : undefined}
      inert={mode === "collapsed" ? true : undefined}
    >
      {/* The overlay arm GROUPS the slot content so the band stays a two-child `space-between` box: the
          section's own header keeps its internal start/end split, and the dismiss owns the trailing edge.
          A claimed context pane supplies NOTHING, so the group renders empty and shell.css collapses the
          whole band exactly as it does docked (HUD-1 §3.1 — the claimant owns its top edge, including its
          own way out). */}
      <header className="shell-panel-header">
        {mode === "overlay" ? (
          <>
            <div className="shell-panel-header-group">{header}</div>
            <Button
              aria-label={label === undefined ? "Close panel" : `Close ${label}`}
              data-slot="panel-overlay-close"
              intent="ghost"
              onClick={onDismiss}
              size="icon"
              type="button"
            >
              <Icon icon={X} size="sm" />
            </Button>
          </>
        ) : (
          header
        )}
      </header>
      <div className="shell-panel-body">{children}</div>
    </aside>
  );
}
