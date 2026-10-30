// contextToggleChrome — the detail-panel (CONTEXT) show/hide toggle as a registered `topbar.trail` widget.
// app-shell registers its OWN chrome through the same door as any other
// feature — no self-privilege. This is now the ONE detail-panel close/open affordance (the panel-header's
// own redundant collapse button is deleted).

import { PanelRightClose, PanelRightOpen } from "@orb/ui/icons";
import type { ChromeEntry, OverflowMenuForm } from "#state";
import { ContextToggle } from "../components/context-toggle.tsx";
import { useShellLayout } from "../hooks/use-shell-layout.ts";
import { contextToggleLabel } from "./context-toggle-label.ts";

export const contextToggleChrome: ChromeEntry = {
  id: "context-toggle",
  label: "Detail panel",
  zone: "topbar.trail",
  order: 30,
  // A section that declares NO context pane (home) gets no door onto one — the same H3 / arm L-b rule the
  // intrinsic list toggle already obeys. `useVisible` is called unconditionally over the door-frozen
  // registry list, so this hook call is legal here.
  useVisible: (): boolean => useShellLayout().contextAvailable,
  // A topbar toggle — the same affordance in bar and sheet lenses; `presentation` is unused today.
  behavior: {
    kind: "widget",
    body: (_presentation): ReturnType<typeof ContextToggle> => <ContextToggle />,
    // The toggle's own handler and state-keyed name, so the menu entry is the same control.
    useMenuForms: (): readonly OverflowMenuForm[] => {
      const layout = useShellLayout();
      const collapsed = layout.contextMode === "collapsed";
      return [
        {
          id: "context-toggle",
          label: contextToggleLabel(collapsed),
          icon: collapsed ? PanelRightOpen : PanelRightClose,
          onSelect: (): void => layout.togglePanel("context"),
        },
      ];
    },
  },
};
