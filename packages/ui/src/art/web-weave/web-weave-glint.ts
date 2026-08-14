// The GLINT — the slow accent window that sweeps the settled web once per period, lighting the silk it
// crosses. Split from web-weave-render.ts under the component-size-ui cap; its own concern anyway: a
// highlight pass over strands somebody else drew.
//
// PER SEGMENT, always. Canvas applies `globalAlpha` at stroke() time, so accumulating a multi-segment
// path while mutating the alpha per segment paints the WHOLE run at the last segment's value — that
// was the owner's "glitchy highlights" (motion-fixes §4a). Each lit segment is its own stroke with its
// own alpha, and the lighting is sampled at the segment MIDPOINT so a long segment cannot flicker
// between two windows.

import type { WeavePoint } from "./web-weave-geometry.ts";

const TAU = Math.PI * 2;
/** One sweep per period (ms) — a slow, linear loop (guide §2 Loading). */
const GLINT_PERIOD_MS = 9000;
/** Half-width of the lit window (radians of bearing from the hub). */
const GLINT_HALF_WIDTH_RAD = 0.3;
/** Below this the segment is skipped entirely rather than stroked at a fraction of a percent. */
const GLINT_MIN_LIT = 0.05;
/** Hermite smoothstep (3p² − 2p³) — the highlight eases in and out of the window instead of ramping. */
const SMOOTHSTEP_CUBIC = 3;
const SMOOTHSTEP_QUADRATIC = 2;
const smoothstep = (p: number): number => p * p * (SMOOTHSTEP_CUBIC - SMOOTHSTEP_QUADRATIC * p);

/** The accent window's center angle at a wall-clock instant. */
export const glintSweepAngle = (now: number): number => ((now / GLINT_PERIOD_MS) % 1) * TAU;

/** How lit ONE SEGMENT is under the sweep, sampled at its midpoint: 1 at the window's center, 0 outside
 *  it or below the visibility floor. */
export function glintSegmentLit(a: WeavePoint, b: WeavePoint, hub: WeavePoint, sweep: number): number {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  let d = Math.abs((((Math.atan2(my - hub.y, mx - hub.x) - sweep) % TAU) + TAU) % TAU);
  if (d > Math.PI) {
    d = TAU - d;
  }
  if (d >= GLINT_HALF_WIDTH_RAD) {
    return 0;
  }
  const lit = smoothstep(1 - d / GLINT_HALF_WIDTH_RAD);
  return lit < GLINT_MIN_LIT ? 0 : lit;
}
