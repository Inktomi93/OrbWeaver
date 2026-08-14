// The WEAVER'S BODY — the procedural painter, split from web-weave-spider.ts (that module is now the
// pose ENGINE: where she is and what she is doing; this one is what she looks like doing it).
//
// Araneid anatomy v2 (weave-lab-upgrades.md §3): eight THREE-segment legs — femur, tibia, tarsus —
// grouped the way an orb-weaver's are (I/II forward, III/IV back, a gap at the flank) and scaled per
// pair (I and IV longest, III shortest), walking an ALTERNATING TETRAPOD (the diagonal four lift
// together, which is what makes a spider read as a spider rather than a wobbling asterisk); a
// cephalothorax, a pedicel, a teardrop abdomen with the orb marking and flank speckles.
//
// Every number is body-local (canvas units at scale 1); the caller has already translated/rotated to
// her pose. No colors: the palette arrives resolved from tokens.

import type { SpiderPose } from "./web-weave-character.ts";
import type { SpiderPalette } from "./web-weave-spider.ts";

const TAU = Math.PI * 2;
const SPIDER_SCALE = 1.15;
/** Hip bearings per leg pair (radians from the body axis): I/II reach FORWARD, III/IV rake BACK, and
 *  the gap between them is the flank a real orb-weaver leaves open. */
const HIP_LEG_I = 0.38;
const HIP_LEG_II = 0.8;
const HIP_LEG_III = 1.9;
const HIP_LEG_IV = 2.35;
const LEG_BASE_ANGLES: readonly number[] = [HIP_LEG_I, HIP_LEG_II, HIP_LEG_III, HIP_LEG_IV];
/** Per-pair length scale — legs I and IV are the long ones, III the stub (araneid proportions). */
const LENGTH_LEG_I = 1.12;
const LENGTH_LEG_II = 0.95;
const LENGTH_LEG_III = 0.85;
const LENGTH_LEG_IV = 1.05;
const LEG_LENGTH_SCALE: readonly number[] = [LENGTH_LEG_I, LENGTH_LEG_II, LENGTH_LEG_III, LENGTH_LEG_IV];
const LEG_FEMUR = 5.6;
const LEG_TIBIA = 4.6;
const LEG_TARSUS = 2.6;
const LEG_KNEE_BEND = 0.62;
const LEG_TARSUS_BEND = 0.5;
const LEG_SHOULDER_X = 2.0;
const LEG_FEMUR_WIDTH = 1.25;
const LEG_TIBIA_WIDTH = 0.95;
const LEG_TARSUS_WIDTH = 0.7;
/** Phase spread down the leg row, so the four on a side don't swing as one plank. */
const GAIT_ROW_PHASE = 0.3;
/** Inspecting: the front two legs palpate what she found. */
const TAP_HZ = 0.03;
const TAP_AMP = 0.28;
const TAP_SIDE_PHASE = 2;
const TAP_LEG_COUNT = 2;
/** The idle twitch: one leg lifts, the abdomen shivers. */
const TWITCH_LEG_INDEX = 1;
const TWITCH_LIFT = 0.5;
const TWITCH_ABDOMEN_AMP = 0.05;
const TWITCH_ABDOMEN_CYCLES = 3;
const HEAD_X = 2.2;
const HEAD_R = 2.4;
const PEDICEL_X = -0.4;
const PEDICEL_R = 1.3;
const ABDOMEN_X = -3.2;
const ABDOMEN_RX = 4.4;
const ABDOMEN_RY = 3.4;
const TAIL_DX = -2.6;
const TAIL_RX = 2.2;
const TAIL_RY = 2.5;
const ORB_MARK_R = 1.15;
const SPECKLE_DX = -1.4;
const SPECKLE_DY = 1.6;
const SPECKLE_R = 0.55;
const SPECKLE_ALPHA = 0.55;
const BREATHE_HZ = 0.0012;
const BREATHE_AMP = 0.04;

/** How she is CARRYING herself this frame — the gait's speed and reach, plus the two life beats. */
export interface SpiderMood {
  readonly gaitHz: number;
  readonly gaitAmp: number;
  /** Leg-swing amplitude while she is still (a resting spider is not a statue). */
  readonly restAmp: number;
  /** 0..1 through an idle twitch, 0 when none is playing. */
  readonly twitchPhase: number;
}

/** One leg's hip bearing this frame: the gait swing, plus tapping and twitching where they apply. */
function hipAngle(pair: number, side: number, { pose, now, mood }: SpiderGait): number {
  // Alternating tetrapod: legs 1/3 on one side swing with 2/4 on the other.
  const tetrapod = (((pair % 2) + (side > 0 ? 0 : 1)) % 2) * Math.PI;
  let swing = Math.sin(now * mood.gaitHz + tetrapod + pair * GAIT_ROW_PHASE) * (pose.moving ? mood.gaitAmp : mood.restAmp);
  if (pose.tap > 0 && pair < TAP_LEG_COUNT) {
    swing += Math.sin(now * TAP_HZ + side * TAP_SIDE_PHASE) * TAP_AMP * pose.tap;
  }
  if (mood.twitchPhase > 0 && pair === TWITCH_LEG_INDEX && side === 1) {
    swing += Math.sin(mood.twitchPhase * Math.PI) * TWITCH_LIFT;
  }
  return (LEG_BASE_ANGLES[pair] as number) + swing;
}

/** What the legs are doing this frame (bundled — the painter's own parameter budget). */
interface SpiderGait {
  readonly pose: SpiderPose;
  readonly now: number;
  readonly mood: SpiderMood;
}

function drawLegs(ctx: CanvasRenderingContext2D, palette: SpiderPalette, gait: SpiderGait): void {
  for (const side of [-1, 1]) {
    LEG_BASE_ANGLES.forEach((_base, pair) => {
      const scale = LEG_LENGTH_SCALE[pair] as number;
      const hip = hipAngle(pair, side, gait) * side;
      const kneeX = LEG_SHOULDER_X + Math.cos(hip) * LEG_FEMUR * scale;
      const kneeY = Math.sin(hip) * LEG_FEMUR * scale;
      const shin = hip + LEG_KNEE_BEND * side;
      const footX = kneeX + Math.cos(shin) * LEG_TIBIA * scale;
      const footY = kneeY + Math.sin(shin) * LEG_TIBIA * scale;
      const toe = shin + LEG_TARSUS_BEND * side;
      ctx.strokeStyle = palette.spiderBody;
      ctx.lineWidth = LEG_FEMUR_WIDTH;
      ctx.beginPath();
      ctx.moveTo(LEG_SHOULDER_X, 0);
      ctx.lineTo(kneeX, kneeY);
      ctx.stroke();
      ctx.strokeStyle = palette.spiderBand;
      ctx.lineWidth = LEG_TIBIA_WIDTH;
      ctx.beginPath();
      ctx.moveTo(kneeX, kneeY);
      ctx.lineTo(footX, footY);
      ctx.stroke();
      ctx.lineWidth = LEG_TARSUS_WIDTH;
      ctx.beginPath();
      ctx.moveTo(footX, footY);
      ctx.lineTo(footX + Math.cos(toe) * LEG_TARSUS * scale, footY + Math.sin(toe) * LEG_TARSUS * scale);
      ctx.stroke();
    });
  }
}

export interface SpiderPaint {
  readonly palette: SpiderPalette;
  readonly pose: SpiderPose;
  readonly now: number;
  readonly mood: SpiderMood;
}

/** Paint the weaver at her pose (translate/rotate/scale, then body-local coordinates). */
export function drawSpiderBody(ctx: CanvasRenderingContext2D, { palette, pose, now, mood }: SpiderPaint): void {
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.angle);
  ctx.scale(SPIDER_SCALE, SPIDER_SCALE);
  ctx.lineCap = "round";
  drawLegs(ctx, palette, { pose, now, mood });
  let breathe = pose.moving ? 1 : 1 + Math.sin(now * BREATHE_HZ) * BREATHE_AMP;
  if (mood.twitchPhase > 0) {
    breathe += Math.sin(mood.twitchPhase * Math.PI * TWITCH_ABDOMEN_CYCLES) * TWITCH_ABDOMEN_AMP;
  }
  ctx.fillStyle = palette.spiderBody;
  ctx.beginPath();
  ctx.arc(HEAD_X, 0, HEAD_R, 0, TAU); // cephalothorax
  ctx.fill();
  ctx.beginPath();
  ctx.arc(PEDICEL_X, 0, PEDICEL_R, 0, TAU); // the waist joining it to the abdomen
  ctx.fill();
  ctx.save();
  ctx.scale(breathe, breathe);
  ctx.beginPath();
  ctx.ellipse(ABDOMEN_X, 0, ABDOMEN_RX, ABDOMEN_RY, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(ABDOMEN_X + TAIL_DX, 0, TAIL_RX, TAIL_RY, 0, 0, TAU); // the teardrop tail
  ctx.fill();
  ctx.fillStyle = palette.spiderBand;
  ctx.beginPath();
  ctx.arc(ABDOMEN_X, 0, ORB_MARK_R, 0, TAU); // the orb marking
  ctx.fill();
  ctx.globalAlpha *= SPECKLE_ALPHA;
  ctx.beginPath();
  ctx.arc(ABDOMEN_X + SPECKLE_DX, SPECKLE_DY, SPECKLE_R, 0, TAU);
  ctx.arc(ABDOMEN_X + SPECKLE_DX, -SPECKLE_DY, SPECKLE_R, 0, TAU);
  ctx.fill();
  ctx.globalAlpha /= SPECKLE_ALPHA;
  ctx.restore();
  ctx.restore();
}
