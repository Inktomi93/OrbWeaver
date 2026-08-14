// The silk's physics (docs/design/weave-lab-upgrades.md §1) — the formulas, asserted as the BEHAVIOUR
// they are supposed to produce rather than as re-spelled arithmetic:
//   • a pluck RINGS (oscillates), FADES (in time), CARRIES (in distance) and DIES (a hard life);
//   • the ring TRAVELS — a point further along the silk peaks later than the strike;
//   • the shiver rises per touch, caps, and decays;
//   • wind/shiver are INERT at zero — the settled web keeps the look it shipped with;
//   • a hit lands on the strand under the pointer, and never on the bridge.
// Deterministic: every function takes `now` — no clock, no rAF, no browser.

import { buildWeb } from "@orb/ui/web-weave";
import { describe } from "vitest";
import type { WeavePluck } from "../../../../packages/ui/src/art/web-weave/web-weave-physics.ts";
import {
  decayShiver,
  findStrandHit,
  PLUCK_LIFE_MS,
  pluckDisplacement,
  pluckOffset,
  raiseShiver,
  swayGain,
} from "../../../../packages/ui/src/art/web-weave/web-weave-physics.ts";
import { expect, test } from "../../../support/fixtures.ts";

const BOX = { width: 1280, height: 800, hub: { x: 0.5, y: 0.42 }, seed: 7 } as const;
/** A strand long enough that index-space and px-space are clearly different. */
const STRAND_LEN = 420;
const STRIKE: WeavePluck = { s0: 0.5, t0: 1000, amp: 6 };
/** The pluck's amplitude e-fold (ms) and spatial e-fold (px) — the two decays under test. */
const DECAY_MS = 380;
const SPREAD_PX = 42;
const E_FOLD = Math.E;

/** Peak |displacement| over a window, sampled per ms — the ring's envelope at one place. */
function peakWithin(s: number, from: number, to: number, plucks: readonly WeavePluck[]): { peak: number; at: number } {
  let peak = 0;
  let at = from;
  for (let t = from; t <= to; t += 1) {
    const v = Math.abs(pluckOffset(STRAND_LEN, s, plucks, t));
    if (v > peak) {
      peak = v;
      at = t;
    }
  }
  return { peak, at };
}

describe("pluck — the damped traveling wave", () => {
  test("it RINGS: the strike point swings both ways, not a one-shot bump", () => {
    const samples: number[] = [];
    for (let t = STRIKE.t0; t < STRIKE.t0 + 200; t += 4) {
      samples.push(pluckOffset(STRAND_LEN, STRIKE.s0, [STRIKE], t));
    }
    expect(Math.max(...samples)).toBeGreaterThan(0);
    expect(Math.min(...samples)).toBeLessThan(0);
    // …and it starts at rest: the silk is not yanked to full amplitude on the first frame.
    expect(pluckOffset(STRAND_LEN, STRIKE.s0, [STRIKE], STRIKE.t0)).toBe(0);
  });

  test("it FADES: the envelope drops by e per decay constant", () => {
    const early = peakWithin(STRIKE.s0, STRIKE.t0, STRIKE.t0 + DECAY_MS, [STRIKE]);
    const late = peakWithin(STRIKE.s0, STRIKE.t0 + DECAY_MS, STRIKE.t0 + 2 * DECAY_MS, [STRIKE]);
    expect(late.peak).toBeLessThan(early.peak);
    expect(early.peak / late.peak).toBeCloseTo(E_FOLD, 0);
  });

  test("it CARRIES a bounded distance: one spread further out is an e-fold weaker", () => {
    const atStrike = peakWithin(STRIKE.s0, STRIKE.t0, STRIKE.t0 + PLUCK_LIFE_MS, [STRIKE]);
    const oneSpread = peakWithin(STRIKE.s0 + SPREAD_PX / STRAND_LEN, STRIKE.t0, STRIKE.t0 + PLUCK_LIFE_MS, [STRIKE]);
    const twoSpreads = peakWithin(STRIKE.s0 + (2 * SPREAD_PX) / STRAND_LEN, STRIKE.t0, STRIKE.t0 + PLUCK_LIFE_MS, [STRIKE]);
    expect(atStrike.peak).toBeGreaterThan(oneSpread.peak);
    expect(oneSpread.peak).toBeGreaterThan(twoSpreads.peak);
  });

  test("it TRAVELS: a point further along the silk peaks LATER than the strike", () => {
    const near = peakWithin(STRIKE.s0, STRIKE.t0, STRIKE.t0 + 400, [STRIKE]);
    const far = peakWithin(STRIKE.s0 + SPREAD_PX / STRAND_LEN, STRIKE.t0, STRIKE.t0 + 400, [STRIKE]);
    expect(far.at).toBeGreaterThan(near.at);
  });

  test("it DIES: past its life the strand is exactly still, and a future pluck is silent", () => {
    expect(pluckOffset(STRAND_LEN, STRIKE.s0, [STRIKE], STRIKE.t0 + PLUCK_LIFE_MS + 1)).toBe(0);
    expect(pluckOffset(STRAND_LEN, STRIKE.s0, [STRIKE], STRIKE.t0 - 1)).toBe(0);
  });

  test("plucks SUPERPOSE — two strikes are the sum, not the last one", () => {
    const second: WeavePluck = { s0: 0.2, t0: 1040, amp: 4 };
    const t = 1120;
    const both = pluckOffset(STRAND_LEN, 0.35, [STRIKE, second], t);
    const a = pluckOffset(STRAND_LEN, 0.35, [STRIKE], t);
    const b = pluckOffset(STRAND_LEN, 0.35, [second], t);
    expect(both).toBeCloseTo(a + b, 10);
  });

  test("the displacement is TRANSVERSE — across the silk, never along it", () => {
    const web = buildWeb(BOX);
    const strand = web.radii[0] as (typeof web.radii)[number];
    const index = Math.floor(strand.pts.length / 2);
    const push = pluckDisplacement(strand, index, [{ s0: 0.5, t0: 0, amp: 6 }], 40);
    const before = strand.pts[index - 1] as { x: number; y: number };
    const after = strand.pts[index + 1] as { x: number; y: number };
    const along = { x: after.x - before.x, y: after.y - before.y };
    expect(Math.hypot(push.x, push.y)).toBeGreaterThan(0);
    // Perpendicular: the dot product with the local tangent is zero.
    expect(push.x * along.x + push.y * along.y).toBeCloseTo(0, 6);
  });

  test("a quiet strand costs nothing — no plucks, no displacement", () => {
    const web = buildWeb(BOX);
    const strand = web.radii[0] as (typeof web.radii)[number];
    expect(pluckDisplacement(strand, 5, [], 1234)).toEqual({ x: 0, y: 0 });
  });
});

describe("shiver + wind — the web-wide amplitude", () => {
  test("a touch raises the shiver, and it caps at one", () => {
    expect(raiseShiver(0)).toBeCloseTo(0.5, 10);
    expect(raiseShiver(0.5)).toBeCloseTo(1, 10);
    expect(raiseShiver(1)).toBe(1);
  });

  test("the shiver decays by e per its constant", () => {
    expect(decayShiver(1, 650)).toBeCloseTo(1 / E_FOLD, 6);
    expect(decayShiver(1, 0)).toBe(1);
  });

  test("INERT at zero: no wind and no shiver leaves the ambient sway exactly as it shipped", () => {
    for (const now of [0, 1234.5, 98_765]) {
      for (const x of [0, 640, 1280]) {
        expect(swayGain({ now, x, wind: 0, shiver: 0 })).toBe(1);
      }
    }
  });

  test("wind and shiver both amplify, and the gust varies across the web's width", () => {
    const now = 4321;
    expect(swayGain({ now, x: 0, wind: 0.5, shiver: 0 })).toBeGreaterThan(1);
    expect(swayGain({ now, x: 0, wind: 0, shiver: 1 })).toBeGreaterThan(1);
    expect(swayGain({ now, x: 0, wind: 1, shiver: 0 })).toBeGreaterThan(swayGain({ now, x: 0, wind: 0.4, shiver: 0 }));
    // The gust is spatial: two points across the width are not gusting in lockstep.
    expect(swayGain({ now, x: 0, wind: 1, shiver: 0 })).not.toBe(swayGain({ now, x: 900, wind: 1, shiver: 0 }));
  });
});

describe("findStrandHit — what the pointer touched", () => {
  const web = buildWeb(BOX);

  test("a point ON a radius hits that radius, at the fraction it struck", () => {
    const radius = web.radii[3] as (typeof web.radii)[number];
    const index = 10;
    const target = radius.pts[index] as { x: number; y: number };
    const hit = findStrandHit(web.strands, target, 10);
    expect(hit).not.toBeNull();
    const { s0, point } = hit as NonNullable<typeof hit>;
    expect(s0).toBeCloseTo(index / (radius.pts.length - 1), 2);
    expect(Math.hypot(point.x - target.x, point.y - target.y)).toBeLessThan(10);
  });

  test("empty canvas hits nothing", () => {
    expect(findStrandHit(web.strands, { x: 3, y: 3 }, 10)).toBeNull();
  });

  test("the BRIDGE is not pluckable — it is the suspension line, not the web", () => {
    const bridge = web.strands.find((s) => s.kind === "bridge") as (typeof web.strands)[number];
    const onBridge = bridge.pts[4] as { x: number; y: number };
    const hit = findStrandHit(web.strands, onBridge, 10);
    expect(hit === null ? null : hit.strand.kind).not.toBe("bridge");
  });
});
