// The room flank's copy of the shell's FLIP stamp (use-shell-track-flip.ts): JS stamps only the direction when the
// plugin column joins or leaves the row, and shell.css owns the distance and the glide. The attribute names stay
// literals here because `css-selector-has-a-writer` reads the writer's literal names.

import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { motionIsReduced } from "#lib";

type FlankDirection = "in" | "out";

/** The keyframe shell.css arms on the transcript rows; the release listens for its end only. */
const FLANK_FLIP_ANIMATION = "room-flank-centre-flip";

function isFlankFlip(animation: Animation): boolean {
  return animation instanceof CSSAnimation && animation.animationName === FLANK_FLIP_ANIMATION;
}

/** The reduced-motion settle: hold the counter-translate for one painted frame, then drop it (two rAFs, for the
 *  reason `use-shell-track-flip.ts`'s `settleWithoutMotion` gives). */
function settle(row: HTMLElement, direction: FlankDirection): () => void {
  row.setAttribute("data-flank-settle", direction);
  let inner = 0;
  const clear = (): void => row.removeAttribute("data-flank-settle");
  const outer = requestAnimationFrame(() => {
    inner = requestAnimationFrame(clear);
  });
  return (): void => {
    cancelAnimationFrame(outer);
    cancelAnimationFrame(inner);
    clear();
  };
}

function flip(row: HTMLElement, direction: FlankDirection): () => void {
  row.setAttribute("data-flank-flip", direction);
  const release = (): void => {
    row.removeEventListener("animationend", onEnd);
    row.removeAttribute("data-flank-flip");
  };
  function onEnd(event: AnimationEvent): void {
    if (event.animationName === FLANK_FLIP_ANIMATION) {
      release();
    }
  }
  row.addEventListener("animationend", onEnd);
  // A room with no rows animates nothing, so no end would ever fire.
  if (!row.getAnimations({ subtree: true }).some(isFlankFlip)) {
    release();
  }
  return release;
}

/** Stamp the direction whenever the column starts or stops taking its share of the row. Still on first commit. */
export function useFlankTrackFlip(rowRef: RefObject<HTMLElement | null>, occupiesRow: boolean): void {
  const previous = useRef<boolean | null>(null);
  const live = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const was = previous.current;
    previous.current = occupiesRow;
    const row = rowRef.current;
    if (was === null || row === null || was === occupiesRow) {
      return;
    }
    // A single animation name cannot restart on a value change: stop the live one and flush style first.
    if (live.current !== null) {
      live.current();
      live.current = null;
      row.getBoundingClientRect();
    }
    const direction: FlankDirection = occupiesRow ? "in" : "out";
    live.current = motionIsReduced() ? settle(row, direction) : flip(row, direction);
  }, [rowRef, occupiesRow]);
}
