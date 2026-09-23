// The WEAVER herself — the pose ENGINE (her body is web-weave-spider-body.ts, her prey response is
// web-weave-prey.ts). Where she is at any instant: walking the build itinerary, tracking a spiral's
// laying tip, riding the A9 strand-out line, answering a disturbance, or resting head-down at the hub
// (real orbweaver posture).
//
// CHARACTER is one preset object threaded through everything she does —
// how hard she bursts on a walk, how fast her legs go, how quickly she turns, how fast she pounces,
// how long she inspects, and whether she twitches at rest. `calm` is the SHIPPED motion (the owner
// ruled the mock "turbo" and the timeline was calmed to match — see the turnRate note below), so a
// host that never passes `character` sees exactly the weave it saw before this module grew presets.

import type { CharacterPreset, SpiderPose } from "./web-weave-character.ts";
import { burstEase, HEAD_DOWN } from "./web-weave-character.ts";
import type { SpiderLeg, WeavePoint, WeaveState, WeaveStrand, WovenWeb } from "./web-weave-geometry.ts";
import { clamp01, easeInOutQuad, easeOutCubic, pointAtFraction, weaveJitter, wrapToPi } from "./web-weave-math.ts";
import type { PreyState } from "./web-weave-prey.ts";
import { preyPose } from "./web-weave-prey.ts";
import { BRIDGE_WALK_START, WEAVE_TIMELINE } from "./web-weave-timeline.ts";

/** The palette slice the spider paints with (the render module's WeavePalette satisfies it
 *  structurally — declared here, narrow, to keep spider ↔ render import-cycle-free). */
export interface SpiderPalette {
  readonly spiderBody: string;
  readonly spiderBand: string;
}

/** The A9 handoff ride duration (wall-clock ms) — shared with the render module's silk line. */
export const STRAND_OUT_MS = 1800;
/** The strand-out heading is read a few samples down the line (a stable early tangent). */
const STRAND_OUT_HEADING_SAMPLE = 10;
const REST_BOB_PX = 0.9;
const REST_BOB_HZ = 0.0009;
/** Squared px a pose must move per frame before the heading re-aims (kills jitter at rest). */
const HEADING_MIN_MOVE_SQ = 0.05;
/** Idle twitches are scheduled in slots this long; a hash decides which slots fire, and the twitch
 *  plays in the last fraction of its slot (so it lands at an unpredictable-looking moment). */
const TWITCH_SLOT_MS = 2600;
const TWITCH_CHANCE = 0.55;
const TWITCH_TAIL = 0.8;
const CH_TWITCH = 5;

/** Last spiral sample born by `t` (binary search over the per-point birth times). Shared with the
 *  render module — the drawn extent and the laying tip must agree by construction. */
export function spiralUpTo(strand: WeaveStrand, t: number): number {
  const vt = strand.vt;
  if (vt === undefined || t >= strand.t1) {
    return strand.pts.length - 1;
  }
  if (t <= strand.t0) {
    return -1;
  }
  let lo = 0;
  let hi = vt.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((vt[mid] as number) <= t) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/** The slice of the frame input the pose engine reads (WeaveFrameInput satisfies it structurally). */
export interface SpiderScene {
  readonly web: WovenWeb;
  readonly state: WeaveState;
  readonly t: number;
  readonly now: number;
  /** Frame delta (ms) — the prey machine integrates position in px/ms. */
  readonly dt: number;
  readonly still: boolean;
  readonly strandOut: { readonly pts: readonly WeavePoint[]; readonly t0: number } | null;
  readonly character: CharacterPreset;
  /** The prey-response machine, or null when the host is not interactive (then she simply rests). */
  readonly prey: PreyState | null;
}

/** Mutable across frames so the spider keeps a stable heading through near-zero moves. */
export interface SpiderTracker {
  prev: { x: number; y: number; angle: number } | null;
}

/** How far through an idle twitch she is (0 = none). Hash-scheduled per slot, so it is deterministic
 *  per seed and never lands on a metronome. */
export function idleTwitchPhase(now: number, seed: number): number {
  const slot = Math.floor(now / TWITCH_SLOT_MS);
  if (weaveJitter(slot, CH_TWITCH, seed) <= TWITCH_CHANCE) {
    return 0;
  }
  const through = (now % TWITCH_SLOT_MS) / TWITCH_SLOT_MS;
  return through > TWITCH_TAIL ? (through - TWITCH_TAIL) / (1 - TWITCH_TAIL) : 0;
}

/** The A9 handoff pose — riding the strand-out line; null once she's off-screen. */
function strandOutPose(scene: SpiderScene): SpiderPose | null {
  const strandOut = scene.strandOut as NonNullable<SpiderScene["strandOut"]>;
  const p = clamp01((scene.now - strandOut.t0) / STRAND_OUT_MS);
  if (p >= 1) {
    return null;
  }
  const pos = pointAtFraction(strandOut.pts, easeOutCubic(p));
  const a = strandOut.pts[0] as WeavePoint;
  const b = strandOut.pts[Math.min(STRAND_OUT_HEADING_SAMPLE, strandOut.pts.length - 1)] as WeavePoint;
  return { ...pos, angle: Math.atan2(b.y - a.y, b.x - a.x), moving: true, sprinting: false, tap: 0 };
}

function spiderLegPosition(web: WovenWeb, leg: SpiderLeg, t: number, character: CharacterPreset): WeavePoint {
  const p = clamp01((t - leg.t0) / (leg.t1 - leg.t0));
  if (leg.tip !== undefined) {
    // The laying tip, CONTINUOUSLY: a spiral's per-point birth times are linear in its sample index, so
    // the index-space fraction IS the birth-time fraction — exact, and free of the stepwise crawl the
    // discrete `spiralUpTo` index produced (the drawn extent still snaps to whole samples; only the
    // spider interpolates, and she rides the last drawn sample's segment).
    const strand = leg.tip === "aux" ? web.aux : web.capture;
    return pointAtFraction(strand.pts, p);
  }
  return pointAtFraction(leg.pts, leg.from + (leg.to - leg.from) * burstEase(easeInOutQuad(p), character.burst));
}

/** Swing the heading a fraction of the way toward the direction of travel — bounded, and held through
 *  a near-zero move (which has no meaningful direction and would otherwise jitter her). */
function turnToward(prev: NonNullable<SpiderTracker["prev"]> | null, pos: WeavePoint, turnRate: number): number {
  if (prev === null) {
    return HEAD_DOWN;
  }
  const dx = pos.x - prev.x;
  const dy = pos.y - prev.y;
  if (dx * dx + dy * dy <= HEADING_MIN_MOVE_SQ) {
    return prev.angle;
  }
  return prev.angle + wrapToPi(Math.atan2(dy, dx) - prev.angle) * turnRate;
}

/** The weaver's pose on the BUILD itinerary (weaving state, mid-build). */
function itineraryPose(scene: SpiderScene, tracker: SpiderTracker): SpiderPose | null {
  const { web, t, character } = scene;
  for (const leg of web.itinerary) {
    if (t >= leg.t0 && t <= leg.t1) {
      const pos = spiderLegPosition(web, leg, t, character);
      const angle = turnToward(tracker.prev, pos, character.turnRate);
      tracker.prev = { x: pos.x, y: pos.y, angle };
      return { ...pos, angle, moving: true, sprinting: false, tap: 0 };
    }
  }
  // No leg claims this instant (a rounding sliver at a beat boundary): HOLD the last pose. Returning
  // null here blinks the weaver out of existence mid-build, which is worse than a frame of stillness.
  const prev = tracker.prev;
  return prev !== null && t > BRIDGE_WALK_START ? { x: prev.x, y: prev.y, angle: prev.angle, moving: false, sprinting: false, tap: 0 } : null;
}

/** Where the weaver is right now — or null (off-screen after the handoff / before she arrives). */
export function spiderPose(scene: SpiderScene, tracker: SpiderTracker): SpiderPose | null {
  const { web, state, t, now, still, prey } = scene;
  if (scene.strandOut !== null) {
    return strandOutPose(scene);
  }
  if (state === "partial") {
    return { x: web.hub.x, y: web.hub.y, angle: HEAD_DOWN, moving: false, sprinting: false, tap: 0 };
  }
  if (state !== "weaving" || t >= WEAVE_TIMELINE.rest) {
    // Settled: either she answers disturbances (interactive) or she simply rests.
    if (prey !== null) {
      return preyPose(prey, { hub: web.hub, now, dt: scene.dt, character: scene.character, still });
    }
    const bob = still ? 0 : Math.sin(now * REST_BOB_HZ) * REST_BOB_PX;
    return { x: web.hub.x, y: web.hub.y + bob, angle: HEAD_DOWN, moving: false, sprinting: false, tap: 0 };
  }
  return itineraryPose(scene, tracker);
}
