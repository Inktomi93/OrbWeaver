// The weaver's pose engine — what the owner reported as
// "nonsensical spider pathing", stated as invariants a frame-by-frame walk of the whole build timeline
// must hold:
//   • PRESENCE — she never blinks out mid-weave (a timeline instant no leg claims used to yield a null
//     pose, and the caller then paints nothing);
//   • CONTINUITY — her position never teleports between consecutive frames (the bridge-walk leg used
//     to overlap the drop leg, so the first-match loop switched legs mid-walk → a jump);
//   • TURN RATE — her heading never snaps (it was a raw per-frame atan2, so a zip-home leg flipped her
//     180° in one frame; it is now a bounded turn toward the target).
// Deterministic by construction: buildWeb at a fixed seed, sampled on a fixed 1ms grid, no rAF.

import { buildWeb, WEAVE_TIMELINE } from "@orb/ui/web-weave";
import { describe } from "vitest";
import type { SpiderPose } from "../../../../packages/ui/src/art/web-weave/web-weave-character.ts";
import { burstEase, WEAVE_CHARACTER_PRESETS } from "../../../../packages/ui/src/art/web-weave/web-weave-character.ts";
import type { SpiderTracker } from "../../../../packages/ui/src/art/web-weave/web-weave-spider.ts";
import { idleTwitchPhase, spiderPose } from "../../../../packages/ui/src/art/web-weave/web-weave-spider.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** The default character — the motion the component shipped with. */
const CALM = WEAVE_CHARACTER_PRESETS.calm;

const BOX = { width: 1280, height: 800, hub: { x: 0.5, y: 0.42 }, seed: 7 } as const;
/** A 1ms grid, not a 60Hz one: a TELEPORT is a discontinuity (it survives however finely you sample),
 *  while genuinely fast motion shrinks with the step. Sampling at 1ms separates the two. */
const FRAME_MS = 1;
/** Per-millisecond position budget. The fastest legitimate leg is a radius zipping home (~600px in
 *  ~70ms) under an ease whose peak slope is 2× its mean → ~17px/ms. A leg-switch teleport measured
 *  159px in ONE step, so 30 admits every real leg and no jump. */
const MAX_STEP_PX = 30;
/** The heading turn rate is a fraction of the shortest angle to the target, so the per-frame change is
 *  bounded by π × that rate; 0.7 is π × 0.22 rounded up. */
const MAX_TURN_RAD = 0.7;
const TAU = Math.PI * 2;

/** She walks the silk itself, so her distance to the strand under her is sub-pixel — a whole pixel of
 *  tolerance covers the sagged polyline's chord error and nothing else. */
const ON_SILK_PX = 1;

const wrapToPi = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** Distance from a point to a polyline (min over its segments). */
function distanceToPolyline(p: { x: number; y: number }, pts: readonly { x: number; y: number }[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i] as { x: number; y: number };
    const b = pts[i + 1] as { x: number; y: number };
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy;
    const u = lenSq === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
    best = Math.min(best, Math.hypot(p.x - (a.x + vx * u), p.y - (a.y + vy * u)));
  }
  return best;
}

interface Sample {
  readonly t: number;
  readonly pose: SpiderPose | null;
}

/** Walk the whole weaving timeline frame by frame through ONE tracker (the loop's real usage). */
function walkTimeline(): readonly Sample[] {
  const web = buildWeb(BOX);
  const tracker: SpiderTracker = { prev: null };
  const start = web.itinerary[0]?.t0 as number;
  const samples: Sample[] = [];
  // [start, rest) — the BUILD walk. The rest beat itself swaps her to the resting posture (head-down at
  // the hub, `moving: false`), a deliberate state change rather than a step of the walk; it is pinned
  // by its own test below.
  for (let t = start; t < WEAVE_TIMELINE.rest; t += FRAME_MS) {
    samples.push({
      t,
      pose: spiderPose({ web, state: "weaving", t, now: t, still: false, strandOut: null, dt: FRAME_MS, character: CALM, prey: null }, tracker),
    });
  }
  return samples;
}

describe("spiderPose — the build walk", () => {
  const samples = walkTimeline();

  test("she is on stage for every frame of the build (never blinks out)", () => {
    const blank = samples.filter((s) => s.pose === null).map((s) => s.t);
    expect(blank).toEqual([]);
  });

  test("her position is continuous — no hand-off gap anywhere on the build", () => {
    const jumps: { t: number; step: number }[] = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]?.pose;
      const b = samples[i]?.pose;
      if (a === null || a === undefined || b === null || b === undefined) {
        continue;
      }
      const step = Math.hypot(b.x - a.x, b.y - a.y);
      if (step > MAX_STEP_PX) {
        jumps.push({ t: samples[i]?.t as number, step: Math.round(step) });
      }
    }
    // The last gap — the scaffold entry, where she used to jump ~100px from the hub to the spiral's
    // inner end — closed when she got a walk-out leg (weave-lab §3). Every leg now hands off where the
    // next one begins, for the whole build.
    expect(jumps).toEqual([]);
  });

  test("her heading turns at a bounded rate — it never snaps", () => {
    const snaps: { t: number; turn: number }[] = [];
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1]?.pose;
      const b = samples[i]?.pose;
      if (a === null || a === undefined || b === null || b === undefined) {
        continue;
      }
      const turn = Math.abs(wrapToPi(b.angle - a.angle));
      if (turn > MAX_TURN_RAD) {
        snaps.push({ t: samples[i]?.t as number, turn: Number(turn.toFixed(2)) });
      }
    }
    expect(snaps).toEqual([]);
  });

  test("she is ON the silk while it is being laid — no strand appears unattended", () => {
    // The strand's drawn extent eases differently from her walk, so she is not AT the drawn tip every
    // frame — but she must never leave the strand she is spinning.
    const web = buildWeb(BOX);
    const tracker: SpiderTracker = { prev: null };
    const offSilk: { kind: string; t: number; away: number }[] = [];
    // One tracker, walked in order, so the pose engine sees the real frame sequence.
    for (let t = web.itinerary[0]?.t0 as number; t < WEAVE_TIMELINE.rest; t += FRAME_MS) {
      const pose = spiderPose({ web, state: "weaving", t, now: t, still: false, strandOut: null, dt: FRAME_MS, character: CALM, prey: null }, tracker);
      const laying = web.strands.filter((s) => t >= s.t0 && t <= s.t1 && s.kind !== "bridge");
      if (pose === null || laying.length === 0) {
        continue;
      }
      const away = Math.min(...laying.map((s) => distanceToPolyline(pose, s.pts)));
      if (away > ON_SILK_PX) {
        offSilk.push({ kind: laying.map((s) => s.kind).join("+"), t, away: Number(away.toFixed(1)) });
      }
    }
    expect(offSilk).toEqual([]);
  });

  test("at the rest beat she settles head-down at the hub", () => {
    const web = buildWeb(BOX);
    const tracker: SpiderTracker = { prev: null };
    const pose = spiderPose(
      { web, state: "weaving", t: WEAVE_TIMELINE.rest, now: 0, still: true, strandOut: null, dt: 16, character: CALM, prey: null },
      tracker,
    );
    expect(pose).toEqual({ x: web.hub.x, y: web.hub.y, angle: Math.PI / 2, moving: false, sprinting: false, tap: 0 });
  });
});

describe("character — burst gait and idle twitches", () => {
  test("burst pulses the walk FORWARD only — it never stalls or reverses", () => {
    // The derivative of p − a·sin(4πp)/(4π) is 1 − a·cos(4πp): positive for every a < 1, which is the
    // property that keeps a bursting walk from sliding backwards mid-stride.
    for (const amount of [0, WEAVE_CHARACTER_PRESETS.lively.burst, WEAVE_CHARACTER_PRESETS.full.burst]) {
      let previous = burstEase(0, amount);
      for (let p = 0.01; p <= 1; p += 0.01) {
        const eased = burstEase(p, amount);
        expect(eased).toBeGreaterThan(previous);
        previous = eased;
      }
      // …and it still runs the whole leg, end to end.
      expect(burstEase(0, amount)).toBeCloseTo(0, 10);
      expect(burstEase(1, amount)).toBeCloseTo(1, 10);
    }
  });

  test("a bursting character is NOT a constant glide (and calm is exactly the shipped glide)", () => {
    expect(burstEase(0.3, CALM.burst)).toBe(0.3);
    expect(burstEase(0.3, WEAVE_CHARACTER_PRESETS.full.burst)).not.toBe(0.3);
  });

  test("idle twitches are hash-scheduled: rare, brief, deterministic per seed", () => {
    const spanMs = 60_000;
    const stepMs = 20;
    let firing = 0;
    let samples = 0;
    for (let now = 0; now < spanMs; now += stepMs) {
      const phase = idleTwitchPhase(now, 7);
      expect(phase).toBeGreaterThanOrEqual(0);
      expect(phase).toBeLessThanOrEqual(1);
      samples += 1;
      if (phase > 0) {
        firing += 1;
      }
    }
    // A twitch plays in the tail of the slots the hash picks — a small minority of the time.
    expect(firing).toBeGreaterThan(0);
    expect(firing / samples).toBeLessThan(0.2);
    // Deterministic per (now, seed), and a different seed twitches on a different schedule.
    expect(idleTwitchPhase(12_345, 7)).toBe(idleTwitchPhase(12_345, 7));
    const other = Array.from({ length: 200 }, (_, i) => idleTwitchPhase(i * 130, 8));
    const mine = Array.from({ length: 200 }, (_, i) => idleTwitchPhase(i * 130, 7));
    expect(other).not.toEqual(mine);
  });
});
