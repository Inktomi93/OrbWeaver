// The room's plugin column, its edge control and the probe that decides whether it fits beside the transcript.
// The presentation they render is `use-flank-presentation.ts`.

import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { PanelEdgeControl } from "#components";
import { publishInlineFlankFit, SIDECAR_PANELS_NOUN } from "#lib";
import type { FlankPresentation } from "../hooks/use-flank-presentation.ts";

/** Publishes whether the transcript would still hold its reading floor with the plugin flank beside it: the room's
 *  width against the token that sums them, so the threshold tracks the font scale. The sentinel is the threshold
 *  itself, laid out and measured, because a custom property holding a sum cannot be read as pixels. */
export function InlineFlankFitProbe(): ReactElement {
  const sentinel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const threshold = sentinel.current;
    const room = threshold?.parentElement;
    if (threshold === null || room === null || room === undefined) {
      return;
    }
    const measure = (): void => publishInlineFlankFit(room.clientWidth >= threshold.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(room);
    return (): void => {
      observer.disconnect();
      publishInlineFlankFit(true);
    };
  }, []);
  return <Row aria-hidden={true} height="none" outOfFlow={true} ref={sentinel} width="flankFit" />;
}

// A panel-mode column slides; an inline column never moves.
function slideOf(flank: FlankPresentation): "shown" | "parked" | undefined {
  if (flank.panelMode) {
    return flank.expanded ? "shown" : "parked";
  }
  return undefined;
}

/** An open panel gives way to the room's height; set inline beside the transcript the column is positioned against its row. */
const PANEL_BOX = { minHeight: "shrinks" } as const;
const INLINE_BOX = { className: "relative @max-cq-32:overflow-y-auto" } as const;

/** One column at its design width that never changes width (a frame inside is never squeezed) and never leaves the
 *  tree (a frame inside stays minted). Out of the row it is positioned against the row, whose `overflow-x-clip`
 *  hides it while parked, and it turns `invisible` once its slide out ends, so nothing of it paints at rest. */
export function FlankColumn({
  flank,
  id,
  columnRef,
  children,
}: {
  readonly flank: FlankPresentation;
  readonly id: string;
  readonly columnRef: RefObject<HTMLDivElement | null>;
  readonly children: ReactNode;
}): ReactElement {
  const overlaid = flank.panelMode && flank.expanded && !flank.inline;
  const slide = slideOf(flank);
  return (
    <Stack
      gap="block"
      paddingBlockStart={flank.panelMode ? "clearance" : "block"}
      cap={flank.panelMode ? undefined : "sidebar"}
      width={flank.panelMode ? "sidebarSm" : undefined}
      scroll={flank.panelMode ? "y" : undefined}
      layer={overlaid ? "raised" : undefined}
      hiddenAt="empty"
      maxHeight={flank.panelMode ? undefined : "halfNarrow"}
      placed={flank.panelMode && !flank.occupiesRow ? "endEdge" : undefined}
      paddingBlockStartNarrow={bandInset(flank)}
      {...(flank.panelMode ? PANEL_BOX : INLINE_BOX)}
      // An open panel that overlays the transcript (not set inline beside it) paints the card ground and lifts. The
      // shell's panel sheet (`panels.css`) keys the slide and the lift on this slot and these two stamps.
      ground={overlaid ? "card" : undefined}
      data-flank-lifted={overlaid ? "" : undefined}
      data-flank-sheet={slide}
      data-collapsed={flank.panelMode && !flank.expanded ? "true" : undefined}
      data-slot="chat-thread-flank"
      id={id}
      inert={flank.panelMode && !flank.expanded}
      ref={columnRef}
    >
      {children}
    </Stack>
  );
}

// A band above the transcript gives up its top inset on a phone.
function bandInset(flank: FlankPresentation): "none" | undefined {
  return flank.panelMode ? undefined : "none";
}

/** The column's one control, at the room's top outer corner where the column's edge is whether it is open or not.
 *  It follows the row in the DOM, so it paints above an open overlay at the same layer. */
export function FlankEdge({
  flank,
  controls,
  controlRef,
}: {
  readonly flank: FlankPresentation;
  readonly controls: string;
  readonly controlRef: RefObject<HTMLButtonElement | null>;
}): ReactElement | null {
  if (!flank.panelMode) {
    return null;
  }
  return (
    <Row placed="flushEnd" layer="raised">
      <PanelEdgeControl controls={controls} edge="end" expanded={flank.expanded} noun={SIDECAR_PANELS_NOUN} onToggle={flank.toggle} ref={controlRef} />
    </Row>
  );
}
