// How the room shows its plugin column on a fine pointer: inline beside the transcript when the transcript keeps
// its reading floor, otherwise parked at the room's edge and opened as an overlay with its own exits.

import { useCoarsePointer } from "@orb/ui/lib";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useFlankHost, useInlineFlankFits } from "#lib";

// The notice region's slot, owned by the `@orb/ui` toast primitive.
const NOTICE_REGION = '[data-slot="toast-viewport"]';

export interface FlankPresentation {
  /** The room hosts plugin panels beside the transcript (a touch device holds them in a sheet instead). */
  readonly panelMode: boolean;
  /** The room is wide enough for the column to sit in the row rather than over the transcript. */
  readonly inline: boolean;
  readonly expanded: boolean;
  readonly toggle: () => void;
  /** The column takes its share of the row; otherwise it is out of flow and the thread reserves the control's corner. */
  readonly occupiesRow: boolean;
}

/** What everything on the transcript's axis keeps clear on its inline end: the column and its gap while the column is in
 *  the row, the edge control's corner while the column is parked or overlaid. Without a panel host the column is as wide
 *  as its contributors make it, so the room measures it (`use-flank-reserve.ts`). */
export function flankReservation(flank: FlankPresentation): "flank" | "clearance" | undefined {
  if (!flank.panelMode) {
    return undefined;
  }
  return flank.occupiesRow ? "flank" : "clearance";
}

/** Inline, the column is open unless the user collapsed it (the plugin host's setting, so it holds across rooms and
 *  reloads). Overlaid, it opens for the moment and closes on Escape, an outside press, or a change of regime; the
 *  room's column and edge control are what "inside" means for those exits. */
export function useFlankPresentation(columnRef: RefObject<HTMLElement | null>, controlRef: RefObject<HTMLElement | null>): FlankPresentation {
  const [overlayOpen, setOverlayOpen] = useState(false);
  const fits = useInlineFlankFits();
  const host = useFlankHost();
  const coarse = useCoarsePointer();
  // A transient overlay does not survive the room changing regime under it.
  const [overlayRegime, setOverlayRegime] = useState(fits);
  if (overlayRegime !== fits) {
    setOverlayRegime(fits);
    setOverlayOpen(false);
  }
  const panelMode = host.panels && !coarse;
  const expanded = fits ? !host.collapsed : overlayOpen;
  useOverlayDismiss(panelMode && !fits && overlayOpen, columnRef, controlRef, () => setOverlayOpen(false));
  return {
    panelMode,
    inline: fits,
    expanded,
    toggle: fits ? host.toggle : (): void => setOverlayOpen(!overlayOpen),
    occupiesRow: !panelMode || (fits && expanded),
  };
}

/** The overlay's exits beyond its control: Escape with focus in the overlay, on its control or on nothing the user is
 *  operating (a press on a part that takes no focus lands on the body or the shell's programmatic focus target) hands
 *  focus back to the control, and a press anywhere outside both closes it. A press in the notice region is not outside: its Undo restores a panel into this overlay. */
function useOverlayDismiss(open: boolean, column: RefObject<HTMLElement | null>, control: RefObject<HTMLElement | null>, close: () => void): void {
  const latestClose = useRef(close);
  useEffect(() => {
    latestClose.current = close;
  });
  useEffect(() => {
    if (!open) {
      return;
    }
    const within = (node: EventTarget | null): boolean =>
      node instanceof Node && (column.current?.contains(node) === true || control.current?.contains(node) === true);
    const onKeyDown = (event: KeyboardEvent): void => {
      const focus = document.activeElement;
      if (event.key === "Escape" && !event.defaultPrevented && (within(focus) || focus === document.body || focus?.getAttribute("tabindex") === "-1")) {
        latestClose.current();
        control.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent): void => {
      if (!(within(event.target) || (event.target instanceof Element && event.target.closest(NOTICE_REGION) !== null))) {
        latestClose.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return (): void => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, column, control]);
}
