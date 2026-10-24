// The room's plugin column, its edge control and the probe that decides whether it fits beside the transcript.
// The presentation they render is `use-flank-presentation.ts`.

import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { PanelEdgeControl } from "#components";
import { cn, publishInlineFlankFit } from "#lib";
import type { FlankPresentation } from "../hooks/use-flank-presentation.ts";

/** Publishes whether the transcript would still hold its reading floor with the plugin flank beside it: the
 *  room's width against the floor plus the flank column and the gap between them, each read off its token so the
 *  threshold tracks the font scale. The sentinel is the threshold itself, laid out and measured. */
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
  return (
    <Row
      aria-hidden={true}
      className="pointer-events-none invisible absolute h-0"
      ref={sentinel}
      style={{ width: "calc(var(--dimension-content-reading-floor) + var(--width-sidebar-sm) + var(--spacing-block))" }}
    />
  );
}

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
  return (
    <Stack
      gap="block"
      className={cn(
        "empty:hidden",
        flank.panelMode
          ? cn(
              "relative min-h-0 w-(--width-sidebar-sm) overflow-y-auto pt-(--size-control-sm) transition-[translate,visibility] duration-(--shell-motion) ease-(--shell-ease)",
              !flank.occupiesRow && "absolute end-0 top-0 bottom-0",
              flank.expanded ? "visible translate-x-0" : "pointer-events-none invisible translate-x-full",
              flank.expanded && !flank.inline && "z-(--z-raised) bg-card shadow-overlay",
            )
          : "max-w-(--width-sidebar-sm) relative pt-block @max-cq-32:max-h-1/2 @max-cq-32:max-w-none @max-cq-32:overflow-y-auto @max-cq-32:pt-0",
      )}
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
    <Row className="absolute end-0 top-0 z-(--z-raised)">
      <PanelEdgeControl controls={controls} edge="end" expanded={flank.expanded} noun="plugin panels" onToggle={flank.toggle} ref={controlRef} />
    </Row>
  );
}
