// The context rail's track-overflow geometry test — pure, apart from context-rail.tsx.
// No React here: the
// rail's `useTrackOverflow` hook (which owns the ResizeObserver/scroll subscription) stays in the
// component file and calls into this for the pure measurement.

import { SCROLL_EDGE_EPSILON_PX } from "@orb/ui/scroll-area";

export interface RailOverflow {
  readonly start: boolean;
  readonly end: boolean;
}

export const NO_OVERFLOW: RailOverflow = { start: false, end: false };

/** Which edges of a horizontally scrolling track are hiding content right now. `scrollLeft` is signed in a
 *  RTL writing mode, so the START test is on its magnitude. */
export function trackOverflow(track: HTMLElement): RailOverflow {
  const travelled = Math.abs(track.scrollLeft);
  const total = track.scrollWidth - track.clientWidth;
  return { start: travelled > SCROLL_EDGE_EPSILON_PX, end: total - travelled > SCROLL_EDGE_EPSILON_PX };
}
