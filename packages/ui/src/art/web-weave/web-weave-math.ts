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
/** The house build easing (matches the mock): fast off the mark, gentle landing. */
export const easeOutCubic = (p: number): number => 1 - (1 - p) ** CUBIC;
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

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

/** Linear interpolation along a polyline at fraction `f` of its INDEX space. */
export function pointAtFraction(pts: readonly WeaveXY[], f: number): WeaveXY {
  const x = f * (pts.length - 1);
  const i = Math.min(Math.floor(x), pts.length - 2);
  const r = x - i;
  const a = pts[i] as WeaveXY;
  const b = pts[i + 1] as WeaveXY;
  return { x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r };
}
