// ContextToggle — the ONE detail-panel (CONTEXT) show/hide affordance. Registered as the
// `contextToggleChrome` widget (lib/context-toggle-chrome.tsx). Replaces the panel-header's own collapse
// button (PanelChrome's `onCollapse`, deleted from app-shell.tsx) — a panel had TWO close controls before
// this widget; now there is exactly one.

import { PanelRightClose, PanelRightOpen } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useShellLayout } from "../hooks/use-shell-layout.ts";
import { TopbarIconButton } from "./shell-topbar.tsx";

export function ContextToggle(): ReactElement {
  const layout = useShellLayout();
  const collapsed = layout.contextMode === "collapsed";
  return (
    <TopbarIconButton
      label={collapsed ? "Show detail panel" : "Hide detail panel"}
      icon={collapsed ? PanelRightOpen : PanelRightClose}
      expanded={!collapsed}
      onClick={(): void => layout.togglePanel("context")}
    />
  );
}
