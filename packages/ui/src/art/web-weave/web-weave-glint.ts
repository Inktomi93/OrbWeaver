// The GLINT — the slow accent window that sweeps the settled web once per period, lighting the silk it
// crosses. Split from web-weave-render.ts under the component-size-ui cap; its own concern anyway: a
// highlight pass over strands somebody else drew.
//
// PER SEGMENT, always. Canvas applies `globalAlpha` at stroke() time, so accumulating a multi-segment
// path while mutating the alpha per segment paints the WHOLE run at the last segment's value — that
// was the owner's "glitchy highlights" (motion-fixes §4a). Each lit segment is its own stroke with its
// own alpha, and the lighting is sampled at the segment MIDPOINT so a long segment cannot flicker
// between two windows.

import type { WeavePoint, WeaveStrand, WovenWeb } from "./web-weave-geometry.ts";

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

// ─── The bearing index (the idle-CPU half, #467) ─────────────────────────────────────────────────
//
// The sweep lights a ~0.6rad window of a full turn, but the naive pass TESTS every segment of the
// capture spiral + all 16 radii — ~850 of them, twice-sampled through the sway — on EVERY frame, to
// find the ~85 that can be lit. That scan was the measured top self-time of the idle login web.
//
// It is skippable EXACTLY, not approximately: a segment's bearing is taken from the HUB, and the
// resting path moves the hub and every point by the SAME vector (the cached blit's whole-canvas
// translate — `WeaveSway` kind `offset`, or `null` under reduced motion). Bearing is invariant under
// translation, so a bearing computed once at build time is the bearing this frame. Only a deformation
// — the live build's per-point FIELD sway, or a ringing pluck — moves points relative to the hub, and
// those frames keep the full scan.

/** One lightable silk segment (`strand.pts[i] → pts[i+1]`), stamped with the STATIC bearing of its
 *  midpoint from the hub, normalized to [0, TAU). */
export interface WeaveGlintSegment {
  readonly strand: WeaveStrand;
  readonly i: number;
  readonly bearing: number;
}

/** Build the bearing-sorted index over the strands the glint lights (the capture spiral + the radii).
 *  Once per built web — deterministic, and pure like the geometry it reads. */
export function buildGlintIndex(web: WovenWeb): readonly WeaveGlintSegment[] {
  const index: WeaveGlintSegment[] = [];
  for (const strand of [web.capture, ...web.radii]) {
    for (let i = 0; i < strand.pts.length - 1; i++) {
      const a = strand.pts[i] as WeavePoint;
      const b = strand.pts[i + 1] as WeavePoint;
      const bearing = Math.atan2((a.y + b.y) / 2 - web.hub.y, (a.x + b.x) / 2 - web.hub.x);
      index.push({ strand, i, bearing: ((bearing % TAU) + TAU) % TAU });
    }
  }
  index.sort((p, q) => p.bearing - q.bearing);
  return index;
}

/** First index whose bearing is ≥ `bearing` (the sorted array's lower bound). */
function lowerBound(index: readonly WeaveGlintSegment[], bearing: number): number {
  let lo = 0;
  let hi = index.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((index[mid] as WeaveGlintSegment).bearing < bearing) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function visitRange(index: readonly WeaveGlintSegment[], from: number, to: number, visit: (segment: WeaveGlintSegment) => void): void {
  for (let k = lowerBound(index, from); k < index.length && (index[k] as WeaveGlintSegment).bearing <= to; k++) {
    visit(index[k] as WeaveGlintSegment);
  }
}

/** Visit every segment whose static bearing falls inside the lit window at `sweep`. Everything skipped
 *  is `glintSegmentLit === 0` by construction, so the painted result is byte-identical to the full scan. */
export function forEachGlintCandidate(index: readonly WeaveGlintSegment[], sweep: number, visit: (segment: WeaveGlintSegment) => void): void {
  const from = sweep - GLINT_HALF_WIDTH_RAD;
  const to = sweep + GLINT_HALF_WIDTH_RAD;
  // The window straddles the 0/TAU seam at two points per sweep — both halves, or the index's own
  // ordering silently drops the segments on the far side of the wrap.
  if (from < 0) {
    visitRange(index, from + TAU, TAU, visit);
    visitRange(index, 0, to, visit);
    return;
  }
  if (to > TAU) {
    visitRange(index, from, TAU, visit);
    visitRange(index, 0, to - TAU, visit);
    return;
  }
  visitRange(index, from, to, visit);
}
