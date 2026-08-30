// ContextToggle — the ONE detail-panel (CONTEXT) show/hide affordance. Registered as the
// `contextToggleChrome` widget (lib/context-toggle-chrome.tsx). Replaces the panel-header's own collapse
// button (PanelChrome's `onCollapse`, deleted from app-shell.tsx) — a panel had TWO close controls before
// this widget; now there is exactly one.

import { PanelRightClose, PanelRightOpen } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useShellLayout } from "../hooks/use-shell-layout.ts";
import { TopbarIconButton } from "./shell-topbar.tsx";

/** ONE CONTROL, ONE NAME, AT EVERY WIDTH (#875 F19, side-eye 2026-08-30 — measured `Show detail panel` at
 *  1280 and `Show details` at 430/768 on the same button).
 *
 *  THE 2026-08-07 VOCABULARY RULING SURVIVES; ITS INPUT CHANGED. That ruling (finding 4, §14) forked the
 *  word by regime — "detail panel" names a frame REGION on a desktop, and on a phone the pane is a sheet
 *  holding the room's DETAILS — and it chose the phone word for the reason that now decides the whole
 *  control: *borrow a word the surface already uses rather than mint one*. Since #860 the surface uses one
 *  word at every width (the pane's own band is the artifact's, and "Details" is the neutral label under
 *  it), while the two names cost a screen-reader user the ability to carry what they learned across a
 *  resize. So the phone spelling becomes the only spelling — the ruling's own criterion, applied once. */
function contextToggleLabel(collapsed: boolean): string {
  return collapsed ? "Show details" : "Hide details";
}

export function ContextToggle(): ReactElement {
  const layout = useShellLayout();
  const collapsed = layout.contextMode === "collapsed";
  return (
    <TopbarIconButton
      label={contextToggleLabel(collapsed)}
      icon={collapsed ? PanelRightOpen : PanelRightClose}
      expanded={!collapsed}
      onClick={(): void => layout.togglePanel("context")}
    />
  );
}
