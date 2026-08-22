// The AMBIENT CADENCE — how often a RESTING web is allowed to repaint (#467: the owner's idle
// pre-auth login screen burned CPU continuously and micro-stuttered). Split from web-weave.tsx under
// the component-size-ui cap, and its own concern besides: the component owns the rAF clock, this
// module owns the question "is anything actually happening?".
//
// WHY a budget at all: nothing on a resting web moves faster than ~2Hz — the glint sweeps one turn in
// 9s, the dew twinkles at ~1Hz, the ambient sway is ±2.1px over ~100s, her rest bob is 0.9px over ~7s.
// At a 60–144Hz refresh the whole live-layer pass (a full-canvas clear + blit, ~230 canvas path ops)
// was re-running for sub-pixel deltas, forever, on a page nobody is touching.
//
// This is a PHASE, not a reduced mode (no-separate-reduced-modes): ONE surface, ONE set of painters.
// The instant anything a person is doing or watching is in flight, the budget is gone and the same
// frame runs at the display's full refresh.

import type { WeavePluckMap } from "./web-weave-sway.ts";

/** Ambient repaints per second while the web is quiet. */
const AMBIENT_FPS = 30;
/** rAF timestamps land a hair under the nominal interval, so the budget carries one frame's slack —
 *  without it a 60Hz display lands 33.33ms against a 33.33ms budget and the cadence jitters 1:1/2:1
 *  (which is itself a stutter). With it, 60Hz divides 2:1 · 120Hz 4:1 · 144Hz 5:1 — always even. */
const AMBIENT_SLACK_MS = 1;
const MS_PER_SECOND = 1000;
export const AMBIENT_FRAME_MS = MS_PER_SECOND / AMBIENT_FPS - AMBIENT_SLACK_MS;

/** How long after her last un-resting frame the full refresh is HELD: her turn back to head-down is a
 *  per-frame ease, so throttling the moment she reaches `rest` would visibly slow that last turn. */
export const PREY_SETTLE_TAIL_MS = 1200;

/** Everything that makes a frame worth painting at full refresh. */
export interface WeaveActivity {
  /** The build is still laying silk. */
  readonly building: boolean;
  /** The A9 handoff line is playing. */
  readonly riding: boolean;
  /** The weaver is off her hub — or still inside the settle tail after coming home. */
  readonly hunting: boolean;
  readonly wind: number;
  readonly shiver: number;
  readonly ringing: boolean;
  /** Read straight from the pointer seam, never from the previous frame's verdict: a SKIPPED frame
   *  never ran `touch.step`, so last frame's `ringing` is stale exactly when a fresh pluck must
   *  un-throttle the loop. */
  readonly plucks: WeavePluckMap;
}

/** Is the web merely BREATHING right now? */
export function weaveIsQuiet(activity: WeaveActivity): boolean {
  const { building, riding, hunting, wind, shiver, ringing, plucks } = activity;
  const busy = building || riding || hunting || ringing || wind !== 0 || shiver !== 0 || (plucks?.size ?? 0) > 0;
  return !busy;
}
