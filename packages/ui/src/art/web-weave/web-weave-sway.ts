// The SWAY FIELD — the ambient breath every layer rides, and the one place a drawn point is moved from
// where the geometry put it. Split from
// web-weave-render.ts under the component-size-ui cap, and the right home besides: it sits directly on
// top of the physics module and below every painter.
//
// A layer painted at REST coordinates over a swaying web visibly floats off it, so strands, glint
// segments, dew and the weaver all come through here.

import type { WeavePoint, WeaveStrand } from "./web-weave-geometry.ts";
import type { WeavePluck } from "./web-weave-physics.ts";
import { pluckDisplacement, swayGain } from "./web-weave-physics.ts";

// Ambient magnitudes — named so the calm is a design decision, not sprinkled numbers (§9.4 tweak 2).
const SWAY_X_PX = 2.1;
const SWAY_Y_PX = 1.5;
const SWAY_X_HZ = 0.0006;
const SWAY_Y_HZ = 0.0005;
const SWAY_X_WAVELENGTH = 0.012;
const SWAY_Y_WAVELENGTH = 0.009;

/** Live plucks per strand. Mutable across frames (the component owns it), read-only to the painters. */
export type WeavePluckMap = ReadonlyMap<WeaveStrand, readonly WeavePluck[]> | null;

/** How a layer rides the ambient breath. ONE field, applied to EVERYTHING that must stay on the silk —
 *  strand points, glint segments, dew, the weaver (a layer painted at rest coordinates over a swaying
 *  web visibly floats off it):
 *    • `field`  — the per-point wave, for the live re-stroked path (renderWeaveFrame);
 *    • `offset` — the single whole-canvas translate the RESTING path's cached blit is drawn with
 *      (design §1.2), so live layers painted over that blit land on the blitted silk;
 *    • `null`   — rigid (reduced motion, the baked buffer, and the bridge while it is still floating).
 */
export type WeaveSway = ({ readonly kind: "field" | "offset"; readonly now: number } & WeaveWeather) | null;

/** The two dials that scale the ambient breath (weave-lab §1): the `wind` prop, and the decaying
 *  web-wide `shiver` a pluck raises. Both zero = the sway the web shipped with, to the bit. */
export interface WeaveWeather {
  readonly wind: number;
  readonly shiver: number;
}

const ORIGIN: WeavePoint = { x: 0, y: 0 };

/** Move a point onto the swaying silk. Pure — the fixed point of the whole sway story. */
export function swayPt(p: WeavePoint, sway: WeaveSway): WeavePoint {
  if (sway === null) {
    return p;
  }
  if (sway.kind === "offset") {
    const { dx, dy } = weaveSwayOffset(sway);
    return { x: p.x + dx, y: p.y + dy };
  }
  const gain = swayGain({ now: sway.now, x: p.x, wind: sway.wind, shiver: sway.shiver });
  return {
    x: p.x + Math.sin(sway.now * SWAY_X_HZ + p.y * SWAY_X_WAVELENGTH) * SWAY_X_PX * gain,
    y: p.y + Math.cos(sway.now * SWAY_Y_HZ + p.x * SWAY_Y_WAVELENGTH) * SWAY_Y_PX * gain,
  };
}

/** One strand SAMPLE as drawn: the sway, plus the transverse ring of any live pluck on that strand.
 *  A strand with no plucks pays nothing beyond the sway (weave-lab perf note). */
export function strandPoint(strand: WeaveStrand, index: number, sway: WeaveSway, plucks: WeavePluckMap): WeavePoint {
  const swayed = swayPt(strand.pts[index] as WeavePoint, sway);
  // Rigid (reduced motion / the baked buffer) means rigid: no rings either.
  if (sway === null) {
    return swayed;
  }
  const live = plucks?.get(strand);
  if (live === undefined || live.length === 0) {
    return swayed;
  }
  const push = pluckDisplacement(strand, index, live, sway.now);
  return { x: swayed.x + push.x, y: swayed.y + push.y };
}

/** The settled web's imperceptible breathing, as a whole-canvas translate offset (px) for the cached
 *  blit — the design §1.2 "sway painted live" applied to the buffer instead of re-stroking every
 *  point (2px amplitude, so the drop from per-point to rigid sway is invisible). */
export function weaveSwayOffset(sway: NonNullable<WeaveSway>): { dx: number; dy: number } {
  // The field sampled at the origin — so the blit's rigid sway and the per-point field are the same
  // motion by construction, and a layer switched between them cannot drift.
  const p = swayPt(ORIGIN, { ...sway, kind: "field" });
  return { dx: p.x, dy: p.y };
}
