// CT harness for the panel edge control: a panel's edge corner with a toggle whose state it owns, the way a host does.
import { PanelEdgeControl } from "@orb/client/components";
import type { ReactElement } from "react";
import { useState } from "react";

export function PanelEdgeControlHarness({ edge }: { readonly edge: "start" | "end" }): ReactElement {
  const [expanded, setExpanded] = useState(true);
  return <PanelEdgeControl controls="panel-under-test" edge={edge} expanded={expanded} noun="plugin panels" onToggle={(): void => setExpanded(!expanded)} />;
}
