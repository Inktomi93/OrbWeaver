// `--expect-no-overflow`'s shapes: the scroll-delta arm AND the child-rect sweep. Their own contract
// module rather than ./types.ts because the argv-heavy Args door sits within a handful of lines of the
// tooling-size cap, and this trio is a self-contained capability that already has its own ops/ half (the
// sweep) and lib/ half (the assertion line).
//
// `scrollWidth - clientWidth` is a POSITIVE-ONLY measure: content pushed off the LEFT or TOP edge of a
// clipping box does not grow the scroll box at all, so the delta reads 0 on a frame where a control is
// painted outside the container and cut (#439/#444 — measured, a `justify-end` nowrap footer put a
// button 35px left of a dialog while this assertion printed `overflow=0x0`). The predicate that decides
// what the rect sweep judges lives with the measurement, in ops/overflow.ts.

const OVERFLOW_SIDES = ["bottom", "left", "right", "top"] as const;
export type OverflowSide = (typeof OVERFLOW_SIDES)[number];

export interface OverflowEscape {
  /** A locatable path to the OUTERMOST escaping element, with its text as a recognition hint. */
  readonly selector: string;
  readonly side: OverflowSide;
  readonly px: number;
}

export interface OverflowProbe {
  /** `scrollWidth - clientWidth` / `scrollHeight - clientHeight` — the historical arm, unchanged. */
  readonly scrollX: number;
  readonly scrollY: number;
  /** Which SIDES the rect sweep judged, and therefore which it did not. Scrolling sanctions content
   *  past the RIGHT/BOTTOM edge — that content is reachable, and the scroll arm above measures it —
   *  but it sanctions nothing on the LEFT/TOP: there is no negative scroll offset, so content before
   *  the content origin is unreachable and cut whatever the overflow value says. (Measured on the live
   *  new-chat dialog, which is `overflow: auto` with a zero scroll delta — an axis-level decline would
   *  have left the instrument blind on the exact surface #439 was found on.) */
  readonly judged: readonly OverflowSide[];
  readonly escapes: readonly OverflowEscape[];
}
