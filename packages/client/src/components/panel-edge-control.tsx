// The one control for a side panel's collapse, drawn at the panel's outer edge. Open, it is the panel's header
// control; closed, it is the slim tab left behind, and the host anchors both states to the same corner so the
// control never moves under the pointer. It names itself with the house verbs ("Hide <noun>" / "Show <noun>"),
// reports its state with `aria-expanded`, and carries a tooltip with the same words.

import { Button } from "@orb/ui/button";
import { ArrowLeftFromLine, ArrowLeftToLine, ArrowRightFromLine, ArrowRightToLine, Icon } from "@orb/ui/icons";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, Ref } from "react";

export interface PanelEdgeControlProps {
  /** Whether the panel is showing. */
  readonly expanded: boolean;
  /** What the panel is, in the words of its verbs: "plugin panels" reads "Hide plugin panels". */
  readonly noun: string;
  /** Which edge of the screen the panel sits against. The glyph's bar is that edge: hide points into it, show out of it. */
  readonly edge: "start" | "end";
  /** The panel element this control shows and hides. */
  readonly controls?: string;
  readonly onToggle: () => void;
  /** The host's handle for handing focus back after a close it ran itself (Escape, an outside click). */
  readonly ref?: Ref<HTMLButtonElement>;
}

// Edge glyphs, not chevrons: a bare chevron reads as the transcript's own Previous/Next variant control.
const GLYPHS = {
  end: { hide: ArrowRightToLine, show: ArrowLeftFromLine },
  start: { hide: ArrowLeftToLine, show: ArrowRightFromLine },
} as const;

export function PanelEdgeControl({ expanded, noun, edge, controls, onToggle, ref }: PanelEdgeControlProps): ReactElement {
  const label = `${expanded ? "Hide" : "Show"} ${noun}`;
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
            ref={ref}
            size="icon-sm"
            type="button"
          >
            <Icon icon={expanded ? GLYPHS[edge].hide : GLYPHS[edge].show} size="sm" />
          </Button>
        }
      />
      <TooltipPopup side={edge === "end" ? "left" : "right"}>{label}</TooltipPopup>
    </Tooltip>
  );
}
