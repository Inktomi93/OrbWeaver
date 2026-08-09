// The WEAVER herself — the spider's pose engine + painter, split from web-weave-render.ts under the
// component-size-ui cap. Pose: where she is at any instant (the build itinerary's walking legs, a
// spiral's laying tip, the A9 strand-out ride, or resting head-down at the hub — real orbweaver
// posture). Paint: procedural body — cephalothorax + breathing abdomen with the orb marking + eight
// two-segment banded legs on a phase-offset gait (golden-orb-weaver reference), gait CALMED with the
// owner's timeline ruling (§9.4 tweak 2).

import type { SpiderLeg, WeavePoint, WeaveState, WeaveStrand, WovenWeb } from "./web-weave-geometry.ts";
import { WEAVE_TIMELINE } from "./web-weave-geometry.ts";
import { clamp01, easeOutCubic, pointAtFraction } from "./web-weave-math.ts";

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
// Body geometry (canvas units at scale 1).
const SPIDER_SCALE = 1.15;
const LEG_HIP_FRONT = 0.42;
const LEG_HIP_MID_FRONT = 0.85;
const LEG_HIP_MID_BACK = 1.55;
const LEG_HIP_BACK = 2.05;
const LEG_BASE_ANGLES: readonly number[] = [LEG_HIP_FRONT, LEG_HIP_MID_FRONT, LEG_HIP_MID_BACK, LEG_HIP_BACK];
/** Gait wobble — slowed from the mock's 0.02 with the timeline calm-down (owner: "it was turbo"). */
const GAIT_HZ = 0.012;
const GAIT_LEG_PHASE = 1.57;
const GAIT_SIDE_PHASE = 0.9;
const GAIT_MOVING_AMP = 0.2;
const GAIT_RESTING_AMP = 0.05;
const LEG_SEGMENT_1 = 6.2;
const LEG_SEGMENT_2 = 5.6;
const LEG_KNEE_BEND = 0.62;
const LEG_SHOULDER_X = 2.0;
const LEG_UPPER_WIDTH = 1.15;
const LEG_LOWER_WIDTH = 1.0;
const HEAD_X = 2.2;
const HEAD_R = 2.4;
const ABDOMEN_X = -3.2;
const ABDOMEN_RX = 4.4;
const ABDOMEN_RY = 3.4;
const ORB_MARK_R = 1.15;
const BREATHE_HZ = 0.0012;
const BREATHE_AMP = 0.04;
const REST_BOB_PX = 0.9;
const REST_BOB_HZ = 0.0009;
const HEAD_DOWN = Math.PI / 2;
/** Squared px a pose must move per frame before the heading re-aims (kills jitter at rest). */
const HEADING_MIN_MOVE_SQ = 0.05;
const TAU = Math.PI * 2;

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

export interface SpiderPose {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
  readonly moving: boolean;
}

/** The slice of the frame input the pose engine reads (WeaveFrameInput satisfies it structurally). */
export interface SpiderScene {
  readonly web: WovenWeb;
  readonly state: WeaveState;
  readonly t: number;
  readonly now: number;
  readonly still: boolean;
  readonly strandOut: { readonly pts: readonly WeavePoint[]; readonly t0: number } | null;
}

/** Mutable across frames so the spider keeps a stable heading through near-zero moves. */
export interface SpiderTracker {
  prev: { x: number; y: number; angle: number } | null;
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
  return { ...pos, angle: Math.atan2(b.y - a.y, b.x - a.x), moving: true };
}

function spiderLegPosition(web: WovenWeb, leg: SpiderLeg, t: number): WeavePoint {
  if (leg.tip !== undefined) {
    const strand = leg.tip === "aux" ? web.aux : web.capture;
    const i = Math.max(spiralUpTo(strand, t), 0);
    return strand.pts[i] as WeavePoint;
  }
  const f = leg.from + (leg.to - leg.from) * easeOutCubic(clamp01((t - leg.t0) / (leg.t1 - leg.t0)));
  return pointAtFraction(leg.pts, f);
}

/** The weaver's pose on the BUILD itinerary (weaving state, mid-build). */
function itineraryPose(scene: SpiderScene, tracker: SpiderTracker): SpiderPose | null {
  const { web, t } = scene;
  for (const leg of web.itinerary) {
    if (t >= leg.t0 && t <= leg.t1) {
      const pos = spiderLegPosition(web, leg, t);
      let angle = HEAD_DOWN;
      const prev = tracker.prev;
      if (prev !== null) {
        const dx = pos.x - prev.x;
        const dy = pos.y - prev.y;
        angle = dx * dx + dy * dy > HEADING_MIN_MOVE_SQ ? Math.atan2(dy, dx) : prev.angle;
      }
      tracker.prev = { x: pos.x, y: pos.y, angle };
      return { ...pos, angle, moving: true };
    }
  }
  return null;
}

/** Where the weaver is right now — or null (off-screen after the handoff / between legs). */
export function spiderPose(scene: SpiderScene, tracker: SpiderTracker): SpiderPose | null {
  const { web, state, t, now, still } = scene;
  if (scene.strandOut !== null) {
    return strandOutPose(scene);
  }
  if (state === "partial") {
    return { x: web.hub.x, y: web.hub.y, angle: HEAD_DOWN, moving: false };
  }
  if (state !== "weaving" || t >= WEAVE_TIMELINE.rest) {
    const bob = still ? 0 : Math.sin(now * REST_BOB_HZ) * REST_BOB_PX;
    return { x: web.hub.x, y: web.hub.y + bob, angle: HEAD_DOWN, moving: false };
  }
  return itineraryPose(scene, tracker);
}

function drawSpiderLegs(ctx: CanvasRenderingContext2D, palette: SpiderPalette, moving: boolean, now: number): void {
  for (const side of [-1, 1]) {
    LEG_BASE_ANGLES.forEach((base, i) => {
      const wobble = Math.sin(now * GAIT_HZ + i * GAIT_LEG_PHASE + (side > 0 ? 0 : GAIT_SIDE_PHASE)) * (moving ? GAIT_MOVING_AMP : GAIT_RESTING_AMP);
      const hip = (base + wobble) * side;
      const kneeX = LEG_SHOULDER_X + Math.cos(hip) * LEG_SEGMENT_1;
      const kneeY = Math.sin(hip) * LEG_SEGMENT_1;
      const shin = hip + LEG_KNEE_BEND * side;
      const footX = kneeX + Math.cos(shin) * LEG_SEGMENT_2;
      const footY = kneeY + Math.sin(shin) * LEG_SEGMENT_2;
      ctx.strokeStyle = palette.spiderBody;
      ctx.lineWidth = LEG_UPPER_WIDTH;
      ctx.beginPath();
      ctx.moveTo(LEG_SHOULDER_X, 0);
      ctx.lineTo(kneeX, kneeY);
      ctx.stroke();
      ctx.strokeStyle = palette.spiderBand;
      ctx.lineWidth = LEG_LOWER_WIDTH;
      ctx.beginPath();
      ctx.moveTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
    });
  }
}

/** Paint the weaver at a pose (translate/rotate/scale, then body-local coordinates). */
export function drawSpiderBody(ctx: CanvasRenderingContext2D, palette: SpiderPalette, pose: SpiderPose, now: number): void {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.scale(SPIDER_SCALE, SPIDER_SCALE);
  ctx.lineCap = "round";
  drawSpiderLegs(ctx, palette, pose.moving, now);
  const breathe = pose.moving ? 1 : 1 + Math.sin(now * BREATHE_HZ) * BREATHE_AMP;
  ctx.fillStyle = palette.spiderBody;
  ctx.beginPath();
  ctx.arc(HEAD_X, 0, HEAD_R, 0, TAU); // cephalothorax
  ctx.fill();
  ctx.save();
  ctx.scale(breathe, breathe);
  ctx.beginPath();
  ctx.ellipse(ABDOMEN_X, 0, ABDOMEN_RX, ABDOMEN_RY, 0, 0, TAU); // abdomen
  ctx.fill();
  ctx.fillStyle = palette.spiderBand;
  ctx.beginPath();
  ctx.arc(ABDOMEN_X, 0, ORB_MARK_R, 0, TAU); // the orb marking
  ctx.fill();
  ctx.restore();
  ctx.restore();
}
