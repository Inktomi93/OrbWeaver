// A side panel's edge control: one `PanelEdgeControl` drawn at the screen-edge corner of the panel's header row.
// The same node serves the panel docked, floating and closed, so it never moves under the pointer. It sits in the
// document beside its panel, so the keyboard reaches it where it is drawn.

import type { ReactElement } from "react";
import { PanelEdgeControl } from "#components";
import type { PanelMode, PanelName } from "#state";
import { CONTEXT_TOGGLE_MARKER, LIST_TOGGLE_MARKER } from "./shell-topbar.tsx";

const EDGES = {
  list: { edge: "start", noun: "list panel", marker: LIST_TOGGLE_MARKER },
  context: { edge: "end", noun: "details", marker: CONTEXT_TOGGLE_MARKER },
} as const satisfies Record<PanelName, { readonly edge: "start" | "end"; readonly noun: string; readonly marker: string }>;

export interface PanelEdgeProps {
  readonly panel: PanelName;
  /** `undefined` ⇒ the panel draws no edge control (not declared, or the phone, whose topbar holds its doors). */
  readonly state: PanelMode | undefined;
  readonly onToggle: (panel: PanelName) => void;
}

export function PanelEdge({ panel, state, onToggle }: PanelEdgeProps): ReactElement | null {
  if (state === undefined) {
    return null;
  }
  const { edge, noun, marker } = EDGES[panel];
  return (
    <div className="shell-panel-edge" data-panel-edge={panel}>
      <PanelEdgeControl edge={edge} expanded={state !== "collapsed"} focusReturnMarker={marker} noun={noun} onToggle={(): void => onToggle(panel)} />
    </div>
  );
}
