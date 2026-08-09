// WebWeave RENDER — the per-frame canvas painters (the impure-but-stateless half; the component owns
// the rAF clock, the palette resolution and the DOM). Split from web-weave.tsx for the same reason
// waystone-geometry left waystone.tsx: the component stays under the `component-size-ui` cap and the
// painting logic is readable on its own (the spider's pose engine + painter live in
// web-weave-spider.ts, the shared maths in web-weave-math.ts). Every function takes (ctx, data,
// time) and draws — no module state, no DOM reads, no color literals (the palette is resolved from
// theme tokens upstream).

import type { WeavePoint, WeaveState, WeaveStrand, WovenWeb } from "./web-weave-geometry.ts";
import { WEAVE_TIMELINE } from "./web-weave-geometry.ts";
import { clamp01, easeOutCubic } from "./web-weave-math.ts";
import type { SpiderTracker } from "./web-weave-spider.ts";
import { drawSpiderBody, STRAND_OUT_MS, spiderPose, spiralUpTo } from "./web-weave-spider.ts";

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
}

const TAU = Math.PI * 2;

// Ambient magnitudes — named so the calm is a design decision, not sprinkled numbers (§9.4 tweak 2).
const SWAY_X_PX = 2.1;
const SWAY_Y_PX = 1.5;
const SWAY_X_HZ = 0.0006;
const SWAY_Y_HZ = 0.0005;
const SWAY_X_WAVELENGTH = 0.012;
const SWAY_Y_WAVELENGTH = 0.009;
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
/** The settle glint: a slow accent window sweeping the web once per period (guide: linear loop). */
const GLINT_PERIOD_MS = 9000;
const GLINT_HALF_WIDTH_RAD = 0.3;
const GLINT_ALPHA = 0.5;
const GLINT_WIDTH = 1.1;
const GLINT_BLUR = 6;
const GLINT_MIN_LIT = 0.05;
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

/** Draw pts[0..upTo]; `swayNow` = wall-clock ms to sway with, or null for a rigid line. */
function drawPolyline(ctx: CanvasRenderingContext2D, pts: readonly WeavePoint[], upTo: number, swayNow: number | null): void {
  ctx.beginPath();
  const n = Math.min(upTo, pts.length - 1);
  for (let i = 0; i <= n; i++) {
    const p = pts[i] as WeavePoint;
    const dx = swayNow === null ? 0 : Math.sin(swayNow * SWAY_X_HZ + p.y * SWAY_X_WAVELENGTH) * SWAY_X_PX;
    const dy = swayNow === null ? 0 : Math.cos(swayNow * SWAY_Y_HZ + p.x * SWAY_Y_WAVELENGTH) * SWAY_Y_PX;
    if (i === 0) {
      ctx.moveTo(p.x + dx, p.y + dy);
    } else {
      ctx.lineTo(p.x + dx, p.y + dy);
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

/** The bridge floats wavy before it catches taut. */
function drawBridgeFloat(ctx: CanvasRenderingContext2D, strand: WeaveStrand, input: WeaveFrameInput, upTo: number): void {
  const floatWindow = WEAVE_TIMELINE.bridge[1] * BRIDGE_FLOAT_UNTIL_FRAC;
  if (input.still || input.t >= floatWindow) {
    return;
  }
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

function drawStrands(ctx: CanvasRenderingContext2D, input: WeaveFrameInput): void {
  const { web, t, now, palette, dim, still } = input;
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
    drawPolyline(ctx, strand.pts, frame.upTo, still || strand.kind === "bridge" ? null : now);
    ctx.shadowBlur = 0;
    if (strand.kind === "bridge") {
      drawBridgeFloat(ctx, strand, input, frame.upTo);
    }
  }
}

function drawGlint(ctx: CanvasRenderingContext2D, input: WeaveFrameInput): void {
  const { web, now, palette, dim } = input;
  const sweep = ((now / GLINT_PERIOD_MS) % 1) * TAU;
  ctx.lineWidth = GLINT_WIDTH;
  ctx.strokeStyle = palette.silkBright;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = GLINT_BLUR;
  const lit = (p: WeavePoint): number => {
    let d = Math.abs((((Math.atan2(p.y - web.hub.y, p.x - web.hub.x) - sweep) % TAU) + TAU) % TAU);
    if (d > Math.PI) {
      d = TAU - d;
    }
    return d < GLINT_HALF_WIDTH_RAD ? 1 - d / GLINT_HALF_WIDTH_RAD : 0;
  };
  for (const strand of [web.capture, ...web.radii]) {
    ctx.beginPath();
    let open = false;
    for (let i = 0; i < strand.pts.length - 1; i++) {
      const p = strand.pts[i] as WeavePoint;
      const glowAmount = lit(p);
      if (glowAmount > GLINT_MIN_LIT) {
        ctx.globalAlpha = GLINT_ALPHA * glowAmount * dim;
        if (!open) {
          ctx.moveTo(p.x, p.y);
          open = true;
        }
        const q = strand.pts[i + 1] as WeavePoint;
        ctx.lineTo(q.x, q.y);
      } else if (open) {
        ctx.stroke();
        ctx.beginPath();
        open = false;
      }
    }
    if (open) {
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
}

function drawDew(ctx: CanvasRenderingContext2D, input: WeaveFrameInput): void {
  const { web, state, t, now, palette, dim, still } = input;
  const born = state === "weaving" ? clamp01((t - WEAVE_TIMELINE.settle) / DEW_CONDENSE_MS) : 1;
  for (const drop of web.dew) {
    const twinkle = still ? DEW_STILL_ALPHA : DEW_TWINKLE_FLOOR + DEW_TWINKLE_GAIN * Math.sin(now * DEW_TWINKLE_HZ * drop.speed + drop.phase) ** 2;
    ctx.fillStyle = palette.dew;
    ctx.globalAlpha = born * twinkle * DEW_ALPHA * dim;
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = born * twinkle * DEW_HALO_ALPHA * dim;
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, drop.r * DEW_HALO_SCALE, 0, TAU);
    ctx.fill();
  }
}

function drawStrandOut(ctx: CanvasRenderingContext2D, input: WeaveFrameInput): void {
  const { palette, dim, now, strandOut, still } = input;
  if (strandOut === null) {
    return;
  }
  const p = still ? 1 : clamp01((now - strandOut.t0) / STRAND_OUT_MS);
  const upTo = Math.round(easeOutCubic(p) * (strandOut.pts.length - 1));
  if (upTo < 1) {
    return;
  }
  ctx.globalAlpha = STRAND_OUT_ALPHA * dim;
  ctx.strokeStyle = palette.silkBright;
  ctx.lineWidth = STRAND_OUT_WIDTH;
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = STRAND_OUT_BLUR;
  drawPolyline(ctx, strandOut.pts, upTo, null);
  ctx.shadowBlur = 0;
}

/** Paint one whole frame. The component clears + DPR-scales the context before calling. */
export function renderWeaveFrame(ctx: CanvasRenderingContext2D, input: WeaveFrameInput, tracker: SpiderTracker): void {
  const settled = input.t >= WEAVE_TIMELINE.settle;
  ctx.lineCap = "round";
  ctx.globalAlpha = 1;
  drawStrands(ctx, input);
  if (settled && !input.still) {
    drawGlint(ctx, input);
  }
  if (settled) {
    drawDew(ctx, input);
  }
  drawStrandOut(ctx, input);
  if (input.spider) {
    const pose = spiderPose(input, tracker);
    if (pose !== null) {
      ctx.globalAlpha = input.dim;
      drawSpiderBody(ctx, input.palette, pose, input.now);
    }
  }
  ctx.globalAlpha = 1;
}
