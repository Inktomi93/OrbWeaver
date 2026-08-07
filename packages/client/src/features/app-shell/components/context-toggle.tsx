// ContextToggle — the ONE detail-panel (CONTEXT) show/hide affordance. Registered as the
// `contextToggleChrome` widget (lib/context-toggle-chrome.tsx). Replaces the panel-header's own collapse
// button (PanelChrome's `onCollapse`, deleted from app-shell.tsx) — a panel had TWO close controls before
// this widget; now there is exactly one.

import { PanelRightClose, PanelRightOpen } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useShellLayout } from "../hooks/use-shell-layout.ts";
import { TopbarIconButton } from "./shell-topbar.tsx";

/** The CONTEXT pane's own vocabulary switch (side-eye 2026-08-07 finding 4, §14) — the twin of the lead
 *  control's. "Detail panel" is a frame region; on a phone the pane is a full-width sheet over the room and
 *  the thing it holds is the room's DETAILS ("Details" is already the pane's own neutral band label, so this
 *  borrows a word the surface uses rather than minting one). The control, its wiring and its reachability
 *  are unchanged in both regimes: it is the only phone door to this sheet, which is why it stays. */
function contextToggleLabel(mobile: boolean, collapsed: boolean): string {
  if (!mobile) {
    return collapsed ? "Show detail panel" : "Hide detail panel";
  }
  return collapsed ? "Show details" : "Hide details";
}

export function ContextToggle(): ReactElement {
  const layout = useShellLayout();
  const collapsed = layout.contextMode === "collapsed";
  return (
    <TopbarIconButton
      label={contextToggleLabel(layout.mobileViewport, collapsed)}
      icon={collapsed ? PanelRightOpen : PanelRightClose}
      expanded={!collapsed}
      onClick={(): void => layout.togglePanel("context")}
    />
  );
}
