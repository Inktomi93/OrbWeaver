// fullscreenChrome — the topbar focus-mode toggle as a registered `topbar.trail` widget.
// app-shell registers its OWN chrome through the same door as any
// other feature — no self-privilege.

import type { ChromeEntry } from "#state";
import { FullscreenToggle } from "../components/fullscreen-toggle.tsx";
import { useShellLayout } from "../hooks/use-shell-layout.ts";

export const fullscreenChrome: ChromeEntry = {
  id: "fullscreen-toggle",
  label: "Focus mode",
  zone: "topbar.trail",
  order: 20,
  // Focus mode IS "hide every panel" — on a section with none (home) it is a control over nothing, so it
  // does not render there at all. NOT APPLICABLE ON A PHONE either (side-eye P1's budget): since the
  // ONE-SHELL rule a phone's LIST is the SCREEN, not a side panel, so "hide every panel" would mean "hide
  // the roster" — which is exactly what the lead's own list toggle does, and the row cannot afford two
  // controls for one act. One surface, one applicability gate — not a mobile mode.
  useVisible: (): boolean => {
    const layout = useShellLayout();
    return layout.anyPanelAvailable && !layout.mobileViewport;
  },
  // A topbar toggle — the same affordance in bar and sheet lenses; `presentation` is unused today.
  behavior: { kind: "widget", body: (_presentation): ReturnType<typeof FullscreenToggle> => <FullscreenToggle /> },
};
