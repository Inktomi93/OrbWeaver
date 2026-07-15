// fullscreenChrome — the topbar focus/immersive toggle as a registered `topbar.trail` widget
// (shell-chrome-unification.md §A). app-shell registers its OWN chrome through the same door as any
// other feature — no self-privilege.

import type { ChromeEntry } from "#state";
import { FullscreenToggle } from "../components/fullscreen-toggle";

export const fullscreenChrome: ChromeEntry = {
  id: "fullscreen-toggle",
  label: "Focus mode",
  zone: "topbar.trail",
  order: 20,
  body: (): ReturnType<typeof FullscreenToggle> => <FullscreenToggle />,
};
