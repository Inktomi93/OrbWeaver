// WebWeave RENDER — the per-frame canvas painters (the impure-but-stateless half; the component owns
// the rAF clock, the palette resolution and the DOM). Split from web-weave.tsx for the same reason
// waystone-geometry left waystone.tsx: the component stays under the `component-size-ui` cap and the
// painting logic is readable on its own (the spider's pose engine + painter live in
// web-weave-spider.ts, the shared maths in web-weave-math.ts). Every function takes (ctx, data,
// time) and draws — no module state, no DOM reads, no color literals (the palette is resolved from
// theme tokens upstream).

import type { CharacterPreset } from "./web-weave-character.ts";
import { REST_GAIT_AMP, SPRINT_GAIT } from "./web-weave-character.ts";
import type { WeavePoint, WeaveState, WeaveStrand, WovenWeb } from "./web-weave-geometry.ts";
import { glintSegmentLit, glintSweepAngle } from "./web-weave-glint.ts";
import { clamp01, easeOutCubic } from "./web-weave-math.ts";
import type { PreyState } from "./web-weave-prey.ts";
import type { SpiderTracker } from "./web-weave-spider.ts";
import { idleTwitchPhase, STRAND_OUT_MS, spiderPose, spiralUpTo } from "./web-weave-spider.ts";
import { drawSpiderBody } from "./web-weave-spider-body.ts";
import type { WeavePluckMap, WeaveSway, WeaveWeather } from "./web-weave-sway.ts";
import { strandPoint, swayPt } from "./web-weave-sway.ts";
import { WEAVE_TIMELINE } from "./web-weave-timeline.ts";

/** The token-derived paint set (§1.3) — resolved by the component via computed style, never literals. */
export interface WeavePalette {
  readonly silk: string;
  readonly silkBright: string;
  readonly glow: string;
  readonly dew: string;
  readonly spiderBody: string;
  readonly spiderBand: string;
}

export interface WeaveFrameInput {
  readonly web: WovenWeb;
  readonly state: WeaveState;
  /** Timeline position (ms since weave start; ≥ settle for resting states). */
  readonly t: number;
  /** Wall-clock ms — drives ambient beats (sway, twinkle, glint) independently of the build clock. */
  readonly now: number;
  readonly palette: WeavePalette;
  readonly dim: number;
  /** Static frame (reduced motion): no sway, dew at rest alpha, no glint, no float. */
  readonly still: boolean;
  readonly spider: boolean;
  /** The A9 handoff line + its start wall-clock time; null unless state === "strand-out". */
  readonly strandOut: { readonly pts: readonly WeavePoint[]; readonly t0: number } | null;
  /** The weather dials (weave-lab §1). `{ wind: 0, shiver: 0 }` is the shipped ambient sway exactly. */
  readonly weather: WeaveWeather;
  /** Frame delta (ms) — the prey machine moves her in px/ms, not px/frame. */
  readonly dt: number;
  /** Who she is (weave-lab §3) — `calm` is the shipped motion. */
  readonly character: CharacterPreset;
  /** Her prey-response machine, or null when the host is not interactive. */
  readonly prey: PreyState | null;
  /** Live plucks, by strand — null for every non-interactive host (the overwhelming majority), and
   *  the per-strand lookup is what keeps physics off the strands nobody touched. */
  readonly plucks: WeavePluckMap;
}

const TAU = Math.PI * 2;

const FRESH_STRAND_MS = 300;
const FRESH_WIDTH_BOOST = 0.5;
const STRAND_ALPHA_BASE = 0.6;
const STRAND_ALPHA_SET = 0.25;
const AUX_ALPHA = 0.38;
const AUX_CONSUMED = 0.92;
const CAPTURE_ALPHA = 0.8;
const CAPTURE_GLOW_BLUR = 3;
const BRIDGE_FLOAT_UNTIL_FRAC = 0.72;
const BRIDGE_FLOAT_ALPHA = 0.25;
const BRIDGE_FLOAT_AMP_PX = 6;
const BRIDGE_FLOAT_HZ = 0.004;
const BRIDGE_FLOAT_PHASE_PER_SAMPLE = 0.5;
/** The settle glint's paint (its LIGHTING lives in web-weave-glint.ts). */
const GLINT_ALPHA = 0.5;
const GLINT_WIDTH = 1.1;
const GLINT_BLUR = 6;
const DEW_CONDENSE_MS = 900;
const DEW_TWINKLE_FLOOR = 0.35;
const DEW_TWINKLE_GAIN = 0.65;
const DEW_TWINKLE_HZ = 0.001;
const DEW_STILL_ALPHA = 0.8;
const DEW_ALPHA = 0.9;
const DEW_HALO_SCALE = 2.4;
const DEW_HALO_ALPHA = 0.25;
const STRAND_OUT_ALPHA = 0.9;
const STRAND_OUT_WIDTH = 1.5;
const STRAND_OUT_BLUR = 7;
/** The two glow techniques for the moving highlights. `blur` = the canvas gaussian `shadowBlur` (the
 *  most expensive 2D op — kept ONLY on the live WEAVING path, where the web is re-stroked anyway).
 *  `soft` = a wide, faint under-stroke in the glow color that fakes the halo with plain line fill —
 *  the RESTING cache path uses it so the settled steady-state carries ZERO per-frame gaussian and the
 *  static glow rides baked in the back-buffer instead (design §1.2). */
type GlowMode = "blur" | "soft";
/** The soft under-glow: width + alpha that approximate each blurred highlight's halo (widths ≈ 2.6× /
 *  2.4× the crisp stroke — GLINT_WIDTH 1.1, STRAND_OUT_WIDTH 1.5 — spelled as literals per no-magic). */
const GLINT_GLOW_WIDTH = 2.86;
const GLINT_GLOW_ALPHA = 0.5;
const STRAND_OUT_GLOW_WIDTH = 3.6;
const STRAND_OUT_GLOW_ALPHA = 0.5;

/** Draw pts[0..upTo] through the sway. */
function drawPolyline(ctx: CanvasRenderingContext2D, pts: readonly WeavePoint[], upTo: number, sway: WeaveSway): void {
  ctx.beginPath();
  const n = Math.min(upTo, pts.length - 1);
  for (let i = 0; i <= n; i++) {
    const p = swayPt(pts[i] as WeavePoint, sway);
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

/** The same, for a STRAND — so its live plucks ride along. */
function drawStrandLine(ctx: CanvasRenderingContext2D, strand: WeaveStrand, upTo: number, motion: { sway: WeaveSway; plucks: WeavePluckMap }): void {
  ctx.beginPath();
  const n = Math.min(upTo, strand.pts.length - 1);
  for (let i = 0; i <= n; i++) {
    const p = strandPoint(strand, i, motion.sway, motion.plucks);
    if (i === 0) {
      ctx.moveTo(p.x, p.y);
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

function strandProgress(strand: WeaveStrand, t: number): number {
  if (t <= strand.t0) {
    return 0;
  }
  if (t >= strand.t1) {
    return 1;
  }
  return easeOutCubic((t - strand.t0) / (strand.t1 - strand.t0));
}

interface StrandFrame {
  readonly alpha: number;
  readonly upTo: number;
  readonly width: number;
}

/** One strand's drawn extent + look at time t (null = not born yet). */
function strandFrame(strand: WeaveStrand, t: number, still: boolean, captureProgress: number): StrandFrame | null {
  if (strand.kind === "aux") {
    // The scaffold — consumed by the capture pass (real orbweaver behavior).
    return { alpha: AUX_ALPHA * (1 - AUX_CONSUMED * captureProgress), upTo: spiralUpTo(strand, t), width: strand.width };
  }
  if (strand.kind === "capture") {
    return { alpha: CAPTURE_ALPHA, upTo: spiralUpTo(strand, t), width: strand.width };
  }
  const p = strandProgress(strand, t);
  if (p === 0) {
    return null;
  }
  const fresh = still ? 0 : clamp01(1 - (t - strand.t1) / FRESH_STRAND_MS);
  return {
    alpha: STRAND_ALPHA_BASE + STRAND_ALPHA_SET * (1 - fresh),
    upTo: Math.round(p * (strand.pts.length - 1)),
    width: strand.width + fresh * FRESH_WIDTH_BOOST,
  };
}

/** The bridge is still adrift (floating wavy, not yet caught taut) — so it does NOT ride the sway. */
function bridgeFloating(input: WeaveFrameInput): boolean {
  return !input.still && input.t < WEAVE_TIMELINE.bridge[1] * BRIDGE_FLOAT_UNTIL_FRAC;
}

/** The bridge floats wavy before it catches taut. */
function drawBridgeFloat(ctx: CanvasRenderingContext2D, strand: WeaveStrand, input: WeaveFrameInput, upTo: number): void {
  if (!bridgeFloating(input)) {
    return;
  }
  const floatWindow = WEAVE_TIMELINE.bridge[1] * BRIDGE_FLOAT_UNTIL_FRAC;
  const settleFrac = input.t / floatWindow;
  ctx.globalAlpha = BRIDGE_FLOAT_ALPHA * input.dim;
  ctx.beginPath();
  for (let i = 0; i <= upTo; i++) {
    const p = strand.pts[i] as WeavePoint;
    const wiggle = Math.sin(input.now * BRIDGE_FLOAT_HZ + i * BRIDGE_FLOAT_PHASE_PER_SAMPLE) * BRIDGE_FLOAT_AMP_PX * (1 - settleFrac);
    if (i === 0) {
      ctx.moveTo(p.x, p.y + wiggle);
    } else {
      ctx.lineTo(p.x, p.y + wiggle);
    }
  }
  ctx.stroke();
}

function drawStrands(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, sway: WeaveSway): void {
  const { web, t, palette, dim, still } = input;
  const captureProgress = clamp01((t - WEAVE_TIMELINE.capture[0]) / (WEAVE_TIMELINE.capture[1] - WEAVE_TIMELINE.capture[0]));
  for (const strand of web.strands) {
    const frame = strandFrame(strand, t, still, captureProgress);
    if (frame === null || frame.upTo < 1) {
      continue;
    }
    ctx.globalAlpha = frame.alpha * dim;
    ctx.strokeStyle = palette.silk;
    ctx.lineWidth = frame.width;
    if (strand.kind === "capture") {
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = CAPTURE_GLOW_BLUR;
    }
    drawStrandLine(ctx, strand, frame.upTo, { sway: strand.kind === "bridge" && bridgeFloating(input) ? null : sway, plucks: input.plucks });
    ctx.shadowBlur = 0;
    if (strand.kind === "bridge") {
      drawBridgeFloat(ctx, strand, input, frame.upTo);
    }
  }
}

function strokeSegment(ctx: CanvasRenderingContext2D, a: WeavePoint, b: WeavePoint): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function drawGlint(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, glow: GlowMode, sway: WeaveSway): void {
  const { web, now, palette, dim, plucks } = input;
  const sweep = glintSweepAngle(now);
  const hub = swayPt(web.hub, sway);
  if (glow === "blur") {
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = GLINT_BLUR;
  }
  for (const strand of [web.capture, ...web.radii]) {
    for (let i = 0; i < strand.pts.length - 1; i++) {
      // The highlight rides the SWAYING (and ringing) silk — the strand is drawn through the same field.
      const a = strandPoint(strand, i, sway, plucks);
      const b = strandPoint(strand, i + 1, sway, plucks);
      const lit = glintSegmentLit(a, b, hub, sweep);
      if (lit === 0) {
        continue;
      }
      // `soft`: a wide, faint glow-color under-stroke fakes the blur halo without the gaussian.
      if (glow === "soft") {
        ctx.strokeStyle = palette.glow;
        ctx.lineWidth = GLINT_GLOW_WIDTH;
        ctx.globalAlpha = GLINT_ALPHA * lit * dim * GLINT_GLOW_ALPHA;
        strokeSegment(ctx, a, b);
      }
      ctx.strokeStyle = palette.silkBright;
      ctx.lineWidth = GLINT_WIDTH;
      ctx.globalAlpha = GLINT_ALPHA * lit * dim;
      strokeSegment(ctx, a, b);
    }
  }
  ctx.shadowBlur = 0;
}

function drawDew(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, sway: WeaveSway): void {
  const { web, state, t, now, palette, dim, still, plucks } = input;
  const born = state === "weaving" ? clamp01((t - WEAVE_TIMELINE.settle) / DEW_CONDENSE_MS) : 1;
  for (const drop of web.dew) {
    // A drop hangs FROM a capture sample: it goes exactly where that sample goes (sway, and a ring),
    // or it visibly floats beside the silk.
    const p = strandPoint(web.capture, drop.index, sway, plucks);
    const twinkle = still ? DEW_STILL_ALPHA : DEW_TWINKLE_FLOOR + DEW_TWINKLE_GAIN * Math.sin(now * DEW_TWINKLE_HZ * drop.speed + drop.phase) ** 2;
    ctx.fillStyle = palette.dew;
    ctx.globalAlpha = born * twinkle * DEW_ALPHA * dim;
    ctx.beginPath();
    ctx.arc(p.x, p.y, drop.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = born * twinkle * DEW_HALO_ALPHA * dim;
    ctx.beginPath();
    ctx.arc(p.x, p.y, drop.r * DEW_HALO_SCALE, 0, TAU);
    ctx.fill();
  }
}

function drawStrandOut(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, glow: GlowMode, sway: WeaveSway): void {
  const { palette, dim, now, strandOut, still } = input;
  if (strandOut === null) {
    return;
  }
  const p = still ? 1 : clamp01((now - strandOut.t0) / STRAND_OUT_MS);
  const upTo = Math.round(easeOutCubic(p) * (strandOut.pts.length - 1));
  if (upTo < 1) {
    return;
  }
  // `soft`: a wide, faint glow-color under-stroke fakes the blur halo without the gaussian.
  if (glow === "soft") {
    ctx.globalAlpha = STRAND_OUT_ALPHA * STRAND_OUT_GLOW_ALPHA * dim;
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = STRAND_OUT_GLOW_WIDTH;
    drawPolyline(ctx, strandOut.pts, upTo, sway);
  }
  ctx.globalAlpha = STRAND_OUT_ALPHA * dim;
  ctx.strokeStyle = palette.silkBright;
  ctx.lineWidth = STRAND_OUT_WIDTH;
  if (glow === "blur") {
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = STRAND_OUT_BLUR;
  }
  // The handoff line is tied to the hub, so it rides the sway with the rest of the web — otherwise the
  // weaver (who does) walks beside her own silk.
  drawPolyline(ctx, strandOut.pts, upTo, sway);
  ctx.shadowBlur = 0;
}

/** The weaver, painted at her pose moved onto the swaying silk (the pose itself stays in web space —
 *  the tracker's heading must not be perturbed by the ambient breath). */
function paintSpider(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, tracker: SpiderTracker, sway: WeaveSway): void {
  if (!input.spider) {
    return;
  }
  const pose = spiderPose(input, tracker);
  if (pose === null) {
    return;
  }
  // Sprinting blurs her legs regardless of character; twitches only play when she is genuinely idle.
  const idle = !pose.moving && pose.tap === 0 && input.character.twitch && !input.still;
  ctx.globalAlpha = input.dim;
  drawSpiderBody(ctx, {
    palette: input.palette,
    pose: { ...pose, ...swayPt(pose, sway) },
    now: input.now,
    mood: {
      gaitHz: pose.sprinting ? SPRINT_GAIT.gaitHz : input.character.gaitHz,
      gaitAmp: pose.sprinting ? SPRINT_GAIT.gaitAmp : input.character.gaitAmp,
      restAmp: REST_GAIT_AMP,
      twitchPhase: idle ? idleTwitchPhase(input.now, input.web.seed) : 0,
    },
  });
}

/** Paint one whole frame LIVE (the weaving build + the reduced-motion single static frame). The
 *  component clears + DPR-scales the context before calling. Uses `blur` glow — the gaussian is only
 *  affordable here because this path already re-strokes the growing web; the RESTING steady-state
 *  goes through the offscreen cache below instead (bakeStaticWeb + drawLiveLayers). */
export function renderWeaveFrame(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, tracker: SpiderTracker): void {
  const settled = input.t >= WEAVE_TIMELINE.settle;
  // This path re-strokes the web every frame, so the sway is the real per-point FIELD.
  const sway: WeaveSway = input.still ? null : { kind: "field", now: input.now, ...input.weather };
  ctx.lineCap = "round";
  ctx.globalAlpha = 1;
  drawStrands(ctx, input, sway);
  if (settled && !input.still) {
    drawGlint(ctx, input, "blur", sway);
  }
  if (settled) {
    drawDew(ctx, input, sway);
  }
  drawStrandOut(ctx, input, "blur", sway);
  paintSpider(ctx, input, tracker, sway);
  ctx.globalAlpha = 1;
}

/** Bake the STATIC web once into the offscreen back-buffer (design §1.2): every strand at its resting
 *  extent, the capture glow BAKED via `shadowBlur` here (paid a single time), no sway. The resting
 *  loop then just `drawImage`s this buffer per frame instead of re-stroking ~all segments + a live
 *  gaussian. Pass an input with `still: true` (kills sway) and `t` at/after settle (partial: PARTIAL_T).
 *  Bake at `dim: 1` — the blit applies `dim` via `globalAlpha`, so a dim change needs no re-bake. */
export function bakeStaticWeb(ctx: CanvasRenderingContext2D, input: WeaveFrameInput): void {
  ctx.lineCap = "round";
  ctx.globalAlpha = 1;
  drawStrands(ctx, input, null); // rigid: the buffer is blitted WITH the sway as a whole-canvas offset
  // (and PLUCK-FREE by construction: a ringing strand is a live layer, never a baked one)
  ctx.globalAlpha = 1;
}

/** The genuinely-dynamic layers painted live OVER the cached blit each resting frame — no strand
 *  re-stroke, no `shadowBlur` (glow is baked or soft-stroked): the glint sweep, the dew twinkle, the
 *  A9 strand-out ride, and the spider. Mirrors renderWeaveFrame's settled/spider gating. */
export function drawLiveLayers(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, tracker: SpiderTracker): void {
  const settled = input.t >= WEAVE_TIMELINE.settle;
  // The silk under these layers is the BLIT, swayed as one whole-canvas translate — so they ride the
  // same offset, not the per-point field, or they slide across the strands they belong to.
  const sway: WeaveSway = input.still ? null : { kind: "offset", now: input.now, ...input.weather };
  ctx.lineCap = "round";
  ctx.globalAlpha = 1;
  if (settled) {
    drawGlint(ctx, input, "soft", sway);
    drawDew(ctx, input, sway);
  }
  drawStrandOut(ctx, input, "soft", sway);
  paintSpider(ctx, input, tracker, sway);
  ctx.globalAlpha = 1;
}
