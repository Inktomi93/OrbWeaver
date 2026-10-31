// contextToggleChrome — the phone's door onto the detail sheet, as a registered `topbar.trail` widget. The
// desktop's detail panel is opened and closed by its edge control (`panel-edges.tsx`); a phone draws no
// panel edge, so the door stays in the row where the overflow menu can take it when the row is narrow.

import { PanelRightClose, PanelRightOpen } from "@orb/ui/icons";
import type { OverflowMenuForm } from "#lib";
import { contextToggleLabel } from "#lib";
import type { ChromeEntry } from "#state";
import { ContextToggle } from "../components/context-toggle.tsx";
import { useShellLayout } from "../hooks/use-shell-layout.ts";

export const contextToggleChrome: ChromeEntry = {
  id: "context-toggle",
  label: "Detail panel",
  zone: "topbar.trail",
  order: 30,
  // A section that declares NO context pane (home) gets no door onto one, and only a phone needs this one.
  // `useVisible` is called unconditionally over the door-frozen registry list, so this hook call is legal here.
  useVisible: (): boolean => {
    const layout = useShellLayout();
    return layout.contextAvailable && layout.mobileViewport;
  },
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
