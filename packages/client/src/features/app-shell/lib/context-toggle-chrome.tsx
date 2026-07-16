// contextToggleChrome — the detail-panel (CONTEXT) show/hide toggle as a registered `topbar.trail` widget
// (shell-chrome-unification.md §A). app-shell registers its OWN chrome through the same door as any other
// feature — no self-privilege. This is now the ONE detail-panel close/open affordance (the panel-header's
// own redundant collapse button is deleted).

import type { ChromeEntry } from "#state";
import { ContextToggle } from "../components/context-toggle";

export const contextToggleChrome: ChromeEntry = {
  id: "context-toggle",
  label: "Detail panel",
  zone: "topbar.trail",
  order: 30,
  // A topbar toggle — the same affordance in bar and sheet lenses; `presentation` is unused today.
  behavior: { kind: "widget", body: (_presentation): ReturnType<typeof ContextToggle> => <ContextToggle /> },
};
