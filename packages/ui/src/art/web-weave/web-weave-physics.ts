// WebWeave PHYSICS — how the silk answers a touch and the weather. A pure
// DISPLACEMENT FIELD composed over the already-built geometry: nothing here rebuilds a web, nothing
// here reads a clock, and with no plucks and no wind every function is the identity — so the settled
// web looks byte-for-byte as it did before this module existed (its `swayGain` returns exactly 1).
//
// Three effects, one composition order (the render module applies them in this order):
//   PLUCK   — a damped transverse traveling wave along ONE strand, displacing it along its own normal.
//             Distance travels in REAL px (strand.length), so a 22-sample radius and a 500-sample
//             spiral ring at the same speed.
//   SHIVER  — the scalar "the whole web felt that": each pluck bumps a web-wide sway boost that decays
//             exponentially, which is what makes a single touch read as vibration spreading outward.
//   WIND    — a steady sway multiplier plus a two-frequency gust that varies across the web's WIDTH,
//             so the sheet breathes unevenly instead of pumping as one rigid object.
//
// Everything is deterministic given (plucks, now) — vitest drives it directly, no rAF, no browser.

import type { WeaveStrand } from "./web-weave-geometry.ts";
import type { WeaveXY } from "./web-weave-math.ts";

/** One live pluck: WHERE it struck (fraction of the strand's index space), WHEN (wall-clock ms), and
 *  how hard (px of transverse displacement at the strike, before decay). */
export interface WeavePluck {
  readonly s0: number;
  readonly t0: number;
  readonly amp: number;
}

/** A pluck is dead after this long — the render skips a strand whose list is empty, so expiry is what
 *  returns a plucked strand to the cheap path. */
export const PLUCK_LIFE_MS = 1500;
/** Amplitude e-fold time: the ring is visibly gone well inside its life. */
const PLUCK_DECAY_MS = 380;
/** Spatial e-fold along the silk (px) — how far the ring carries from the strike. */
const PLUCK_SPREAD_PX = 42;
/** Temporal frequency (rad/ms) and wavenumber (rad/px) — together, the wave's travel speed. */
const PLUCK_HZ = 0.05;
const PLUCK_WAVENUMBER = 0.16;
/** Live plucks kept per strand: enough for a drag across it, few enough that the per-point sum stays
 *  trivial (the render already pays a point loop; this must not turn it into a physics engine). */
export const PLUCK_MAX_PER_STRAND = 6;

/** Transverse displacement (px) at index-fraction `s` of a strand, summed over its live plucks.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function pluckOffset(strandLength: number, s: number, plucks: readonly WeavePluck[], now: number): number {
  let offset = 0;
  for (const pluck of plucks) {
    const age = now - pluck.t0;
    if (age < 0 || age > PLUCK_LIFE_MS) {
      continue;
    }
    const distance = Math.abs(s - pluck.s0) * strandLength;
    offset += pluck.amp * Math.exp(-age / PLUCK_DECAY_MS) * Math.exp(-distance / PLUCK_SPREAD_PX) * Math.sin(age * PLUCK_HZ - distance * PLUCK_WAVENUMBER);
  }
  return offset;
}

/** The pluck displacement of one SAMPLE, as a vector along the strand's local normal (zero when the
 *  strand is quiet — the caller's fast path). */
export function pluckDisplacement(strand: WeaveStrand, index: number, plucks: readonly WeavePluck[], now: number): WeaveXY {
  const offset = pluckOffset(strand.length, index / (strand.pts.length - 1), plucks, now);
  if (offset === 0) {
    return ORIGIN;
  }
  const before = strand.pts[Math.max(0, index - 1)] as WeaveXY;
  const after = strand.pts[Math.min(strand.pts.length - 1, index + 1)] as WeaveXY;
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const span = Math.hypot(dx, dy) || 1;
  return { x: (-dy / span) * offset, y: (dx / span) * offset };
}

const ORIGIN: WeaveXY = { x: 0, y: 0 };

/** Each pluck adds this to the web-wide shiver (clamped at 1 — a drag can't shake the web apart). */
const SHIVER_PER_PLUCK = 0.5;
/** Shiver e-fold time (ms). */
const SHIVER_DECAY_MS = 650;
/** …and the floor it SNAPS to zero at (#467). An exponential never reaches zero, and a nonzero shiver
 *  is not a rounding curiosity here: it un-statics the frame, so a single mouse pass over the silk
 *  used to hold the web off its offscreen cache — re-stroking every strand, every frame — for the
 *  ~8 minutes the value took to underflow. At this floor the shiver's sway boost is 0.005px of a
 *  2.1px breath: three orders below a pixel, and reached ~4s after the last touch. */
const SHIVER_FLOOR = 1e-3;

/** Register a pluck on the web-wide shiver. */
export const raiseShiver = (shiver: number): number => Math.min(1, shiver + SHIVER_PER_PLUCK);
/** Decay the shiver across a frame's `dt` (ms) — to EXACTLY zero once it is imperceptible. */
export const decayShiver = (shiver: number, dt: number): number => {
  const next = shiver * Math.exp(-dt / SHIVER_DECAY_MS);
  return next < SHIVER_FLOOR ? 0 : next;
};

/** Sway multiplier at full wind — a stiff breeze roughly triples the ambient breath. */
const WIND_SWAY_GAIN = 2.6;
/** Sway multiplier at full shiver. */
const SHIVER_SWAY_GAIN = 2.2;
/** The gust: two slow frequencies, the faster one carrying a spatial phase across the web's width, so
 *  one side gusts before the other. Scaled by wind — at wind 0 the gust term vanishes entirely. */
const GUST_SLOW_HZ = 3e-4;
const GUST_FAST_HZ = 7.3e-4;
const GUST_WAVELENGTH = 0.002;
const GUST_HALF = 0.5;

export interface SwayGainInput {
  /** Wall-clock ms. */
  readonly now: number;
  /** The sampled point's x (the gust varies across the width). */
  readonly x: number;
  /** 0..1 weather dial. */
  readonly wind: number;
  /** 0..1 decaying "the web felt that" boost. */
  readonly shiver: number;
}

/** The ambient sway's amplitude multiplier. EXACTLY 1 with no wind and no shiver — the inert default
 *  is what keeps the settled web unchanged for every host that never touches these props. */
export function swayGain({ now, x, wind, shiver }: SwayGainInput): number {
  const gust = 1 + (Math.sin(now * GUST_SLOW_HZ) * GUST_HALF + Math.sin(now * GUST_FAST_HZ + x * GUST_WAVELENGTH) * GUST_HALF) * wind;
  return (1 + wind * WIND_SWAY_GAIN + shiver * SHIVER_SWAY_GAIN) * gust;
}

/** Where a pointer landed on the web: the strand it struck and the index-fraction of the strike. */
export interface WeaveStrandHit {
  readonly strand: WeaveStrand;
  readonly s0: number;
  readonly point: WeaveXY;
}

/** Every other sample is tested — the silk is sampled far finer than a fingertip is precise. */
const HIT_STRIDE = 2;

/** The strand under a pointer, or null. The BRIDGE is exempt: it is the web's suspension line, off in
 *  the corners of the box, and plucking it reads as touching the frame rather than the web. */
export function findStrandHit(strands: readonly WeaveStrand[], at: WeaveXY, hitRadius: number): WeaveStrandHit | null {
  const radiusSq = hitRadius * hitRadius;
  for (const strand of strands) {
    if (strand.kind === "bridge") {
      continue;
    }
    for (let i = 0; i < strand.pts.length; i += HIT_STRIDE) {
      const p = strand.pts[i] as WeaveXY;
      const dx = p.x - at.x;
      const dy = p.y - at.y;
      if (dx * dx + dy * dy < radiusSq) {
        return { strand, s0: i / (strand.pts.length - 1), point: p };
      }
    }
  }
  return null;
}
