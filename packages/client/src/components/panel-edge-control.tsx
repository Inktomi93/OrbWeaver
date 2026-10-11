// The one control for a side panel's collapse, drawn at the panel's outer edge. Open, it is the panel's header
// control; closed, it is the slim tab left behind, and the host anchors both states to the same corner so the
// control never moves under the pointer. It names itself with the house verbs ("Hide <noun>" / "Show <noun>"),
// reports its state with `aria-expanded`, and carries a tooltip with the same words.

import { Button } from "@orb/ui/button";
import { ChevronLeft, ChevronRight, Icon } from "@orb/ui/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";

export interface PanelEdgeControlProps {
  /** Whether the panel is showing. */
  readonly expanded: boolean;
  /** What the panel is, in the words of its verbs: "plugin panels" reads "Hide plugin panels". */
  readonly noun: string;
  /** Which edge of the screen the panel sits against. The glyph points toward that edge to hide and away to show. */
  readonly edge: "start" | "end";
  /** The panel element this control shows and hides. */
  readonly controls?: string;
  readonly onToggle: () => void;
}

export function PanelEdgeControl({ expanded, noun, edge, controls, onToggle }: PanelEdgeControlProps): ReactElement {
  const label = `${expanded ? "Hide" : "Show"} ${noun}`;
  const towardEdge = edge === "end" ? ChevronRight : ChevronLeft;
  const awayFromEdge = edge === "end" ? ChevronLeft : ChevronRight;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-controls={controls}
            aria-expanded={expanded}
            aria-label={label}
            data-expanded={expanded ? "true" : "false"}
            data-slot="panel-edge-control"
            intent={expanded ? "ghost" : "outline"}
            onClick={onToggle}
            size="icon-sm"
            type="button"
          >
            <Icon icon={expanded ? towardEdge : awayFromEdge} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side={edge === "end" ? "left" : "right"}>{label}</TooltipPopup>
    </Tooltip>
  );
}
