// Web-weave shared maths — the floor under the family (geometry builds with it, the render + spider
// painters interpolate with it). Split out under the component-size-ui cap; structural `{x,y}` points
// so this module carries no type cycles (its one value import, `#lib`'s `sinHash`, is the shared
// seeded-hash engine — waystone-geometry.ts's `jitter` is the sibling consumer).

import { sinHash } from "#lib";

/** A 2D point, structurally compatible with the geometry module's WeavePoint. */
export interface WeaveXY {
  readonly x: number;
  readonly y: number;
}

const CUBIC = 3;
const HALF = 0.5;
const TAU = Math.PI * 2;
/** The house build easing (matches the mock): fast off the mark, gentle landing. */
export const easeOutCubic = (p: number): number => 1 - (1 - p) ** CUBIC;
/** The house WALK easing: eases in as well as out, so a walker handed a new leg accelerates into it
 *  instead of lurching from a standstill at full speed (the mock's per-leg easeOutCubic lurch). */
export const easeInOutQuad = (p: number): number => (p < HALF ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The shortest signed way round from one heading to another, in (−π, π] — so a turn takes the short
 *  arc and a heading never unwinds the long way. */
export function wrapToPi(angle: number): number {
  return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
}

/** Stable pseudo-random in [0,1) from two ints + the web's seed — identical web per seed. */
export function weaveJitter(a: number, b: number, seed: number): number {
  return sinHash(a, b, seed);
}

/** A sagging strand: quadratic curve toward +y, sampled. */
export function sagLine(a: WeaveXY, b: WeaveXY, sag: number, samples: number): WeaveXY[] {
  const pts: WeaveXY[] = [];
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2 + sag;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * mx + t * t * b.x, y: u * u * a.y + 2 * u * t * my + t * t * b.y });
  }
  return pts;
}

/** One boundary segment for the ray caster. */
export interface WeaveSegment {
  readonly a: WeaveXY;
  readonly b: WeaveXY;
}

/** Ray/segment parallelism epsilon. */
const EPSILON = 1e-9;

/** Ray (from `p` along `d`) vs segment `ab` → the ray parameter, or null when they miss. */
function raySegment(p: WeaveXY, d: WeaveXY, a: WeaveXY, b: WeaveXY): number | null {
  const den = d.x * (b.y - a.y) - d.y * (b.x - a.x);
  if (Math.abs(den) < EPSILON) {
    return null;
  }
  const qx = a.x - p.x;
  const qy = a.y - p.y;
  const t = (qx * (b.y - a.y) - qy * (b.x - a.x)) / den;
  const u = (qx * d.y - qy * d.x) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

/** A polyline's segments — `closed` wraps the last point back to the first (a polygon). */
export function toSegments(pts: readonly WeaveXY[], closed = false): WeaveSegment[] {
  const segments: WeaveSegment[] = [];
  const last = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < last; i++) {
    segments.push({ a: pts[i] as WeaveXY, b: pts[(i + 1) % pts.length] as WeaveXY });
  }
  return segments;
}

/** Distance from `origin` along unit direction `d` to the NEAREST of `segments` — Infinity if it
 *  crosses none. (The web's radii and spirals are sized by casting against the drawn silk this way.) */
export function nearestRayHit(origin: WeaveXY, d: WeaveXY, segments: readonly WeaveSegment[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const { a, b } of segments) {
    const t = raySegment(origin, d, a, b);
    if (t !== null && t < best) {
      best = t;
    }
  }
  return best;
}

/** Total arc length of a polyline (px). */
export function polylineLength(pts: readonly WeaveXY[]): number {
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    total += Math.hypot((pts[i + 1] as WeaveXY).x - (pts[i] as WeaveXY).x, (pts[i + 1] as WeaveXY).y - (pts[i] as WeaveXY).y);
  }
  return total;
}

/** Linear interpolation along a polyline at fraction `f` of its INDEX space. */
export function pointAtFraction(pts: readonly WeaveXY[], f: number): WeaveXY {
  const x = f * (pts.length - 1);
  const i = Math.min(Math.floor(x), pts.length - 2);
  const r = x - i;
  const a = pts[i] as WeaveXY;
  const b = pts[i + 1] as WeaveXY;
  return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
}
