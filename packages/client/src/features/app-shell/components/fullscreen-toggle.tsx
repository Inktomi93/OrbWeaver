// FullscreenToggle — the topbar focus-mode toggle button. Registered as the `fullscreenChrome` widget
// (lib/fullscreen-chrome.tsx); this component owns the render, the widget owns registration.
//
// Label, icon and pressed state ALL read the one `focusMode` flag (never a re-derivation from the panel
// modes — that is the item-20 desync, where a narrow auto-collapse made the button claim focus the user
// never entered).

import { Expand, Shrink } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useShellLayout } from "../hooks/use-shell-layout.ts";
import { TopbarIconButton } from "./shell-topbar.tsx";

export function FullscreenToggle(): ReactElement {
  const layout = useShellLayout();
  return (
    <TopbarIconButton
      label={layout.focusMode ? "Exit focus mode" : "Enter focus mode"}
      icon={layout.focusMode ? Shrink : Expand}
      pressed={layout.focusMode}
      onClick={layout.toggleFocus}
    />
  );
}
