// fullscreenChrome — the topbar focus-mode toggle as a registered `topbar.trail` widget
// (shell-chrome-unification.md §A). app-shell registers its OWN chrome through the same door as any
// other feature — no self-privilege.

import type { ChromeEntry } from "#state";
import { FullscreenToggle } from "../components/fullscreen-toggle";
import { useShellLayout } from "../hooks/use-shell-layout";

export const fullscreenChrome: ChromeEntry = {
  id: "fullscreen-toggle",
  label: "Focus mode",
  zone: "topbar.trail",
  order: 20,
  // Focus mode IS "hide every panel" — on a section with none (home) it is a control over nothing, so it
  // does not render there at all.
  useVisible: (): boolean => useShellLayout().anyPanelAvailable,
  // A topbar toggle — the same affordance in bar and sheet lenses; `presentation` is unused today.
  behavior: { kind: "widget", body: (_presentation): ReturnType<typeof FullscreenToggle> => <FullscreenToggle /> },
};
