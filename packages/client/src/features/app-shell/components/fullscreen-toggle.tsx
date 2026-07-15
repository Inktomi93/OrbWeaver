// FullscreenToggle — the topbar focus/immersive toggle button. Registered as the `fullscreenChrome`
// widget (lib/fullscreen-chrome.tsx); this component owns the render, the widget owns registration.

import { Expand, Shrink } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { useShellLayout } from "../hooks/use-shell-layout";
import { TopbarIconButton } from "./shell-topbar";

export function FullscreenToggle(): ReactElement {
  const layout = useShellLayout();
  return (
    <TopbarIconButton
      label={layout.immersive ? "Exit focus mode" : "Enter focus mode"}
      icon={layout.immersive ? Shrink : Expand}
      pressed={layout.immersive}
      onClick={layout.toggleFocus}
    />
  );
}
