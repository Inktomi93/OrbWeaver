// The shell's edge controls: one `PanelEdgeControl` per side panel, drawn at the screen-edge corner of the panel's
// header row. The same node serves the panel open and closed, so the control never moves under the pointer.

import type { ReactElement } from "react";
import { PanelEdgeControl } from "#components";
import type { PanelName } from "#state";
import { CONTEXT_TOGGLE_MARKER } from "./context-toggle.tsx";
import { LIST_TOGGLE_MARKER } from "./shell-topbar.tsx";

/** The modes a panel draws its edge control in; a floating sheet carries its own dismiss. */
export type PanelEdgeState = "docked" | "collapsed";

export interface PanelEdgesProps {
  /** `undefined` ⇒ the panel draws no edge control (not declared, the phone's screen swap, or a floating sheet). */
  readonly list: PanelEdgeState | undefined;
  readonly context: PanelEdgeState | undefined;
  readonly onToggle: (panel: PanelName) => void;
}

export function PanelEdges({ list, context, onToggle }: PanelEdgesProps): ReactElement {
  return (
    <>
      {list === undefined ? null : (
        <div className="shell-panel-edge" data-panel-edge="list">
          <PanelEdgeControl
            edge="start"
            expanded={list === "docked"}
            focusReturnMarker={LIST_TOGGLE_MARKER}
            noun="list panel"
            onToggle={(): void => onToggle("list")}
          />
        </div>
      )}
      {context === undefined ? null : (
        <div className="shell-panel-edge" data-panel-edge="context">
          <PanelEdgeControl
            edge="end"
            expanded={context === "docked"}
            focusReturnMarker={CONTEXT_TOGGLE_MARKER}
            noun="details"
            onToggle={(): void => onToggle("context")}
          />
        </div>
      )}
    </>
  );
}
