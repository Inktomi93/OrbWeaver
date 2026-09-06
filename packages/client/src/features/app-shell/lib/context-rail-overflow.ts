// The context rail's track-overflow geometry test — pure, split out of context-rail.tsx by the
// `component-size` cap (#1799's dot-arm comment pushed the file eight lines over). No React here: the
// rail's `useTrackOverflow` hook (which owns the ResizeObserver/scroll subscription) stays in the
// component file and calls into this for the pure measurement.

export interface RailOverflow {
  readonly start: boolean;
  readonly end: boolean;
}

export const NO_OVERFLOW: RailOverflow = { start: false, end: false };

/** Sub-pixel track widths are routine (a fractional container width divided into `1fr` tracks), so the fit
 *  test needs a tolerance or every rail claims to overflow by 0.4px. */
const OVERFLOW_EPSILON_PX = 1;

/** Which edges of a horizontally scrolling track are hiding content right now. `scrollLeft` is signed in a
 *  RTL writing mode, so the START test is on its magnitude. */
export function trackOverflow(track: HTMLElement): RailOverflow {
  const travelled = Math.abs(track.scrollLeft);
  const total = track.scrollWidth - track.clientWidth;
  return { start: travelled > OVERFLOW_EPSILON_PX, end: total - travelled > OVERFLOW_EPSILON_PX };
}
