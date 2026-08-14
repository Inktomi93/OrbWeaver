// The weaver's pose engine (docs/design/web-weave-motion-fixes.md §3) — what the owner reported as
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
import type { SpiderPose, SpiderTracker } from "../../../../packages/ui/src/art/web-weave/web-weave-spider.ts";
import { spiderPose } from "../../../../packages/ui/src/art/web-weave/web-weave-spider.ts";
import { expect, test } from "../../../support/fixtures.ts";

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
/** The scaffold entry (the hub → the spiral's inner end) is a gap in the itinerary DATA — a free-zone
 *  radius wide, ~0.18 × mean reach. Anything bigger is a leg-switch bug, not the entry. */
const HANDOFF_GAP_MAX_PX = 140;
const TAU = Math.PI * 2;

const wrapToPi = (a: number): number => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

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
    samples.push({ t, pose: spiderPose({ web, state: "weaving", t, now: t, still: false, strandOut: null }, tracker) });
  }
  return samples;
}

describe("spiderPose — the build walk", () => {
  const samples = walkTimeline();

  test("she is on stage for every frame of the build (never blinks out)", () => {
    const blank = samples.filter((s) => s.pose === null).map((s) => s.t);
    expect(blank).toEqual([]);
  });

  test("her position is continuous — the ONE hand-off gap is the scaffold entry, and nothing else", () => {
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
    // The scaffold leg begins at the spiral's INNER end (a free-zone radius out from the hub) while the
    // last radius leg left her AT the hub — a gap in the itinerary DATA, not in the pose engine, and the
    // only one. Pinned here so it stays single and bounded; closing it needs a walk-out leg (and the
    // scaffold's own birth times shifted with it), which is a choreography change, not a motion fix.
    expect(jumps.map((j) => j.t)).toEqual([WEAVE_TIMELINE.aux[0] + FRAME_MS]);
    expect(jumps[0]?.step).toBeLessThan(HANDOFF_GAP_MAX_PX);
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

  test("at the rest beat she settles head-down at the hub", () => {
    const web = buildWeb(BOX);
    const tracker: SpiderTracker = { prev: null };
    const pose = spiderPose({ web, state: "weaving", t: WEAVE_TIMELINE.rest, now: 0, still: true, strandOut: null }, tracker);
    expect(pose).toEqual({ x: web.hub.x, y: web.hub.y, angle: Math.PI / 2, moving: false });
  });
});
