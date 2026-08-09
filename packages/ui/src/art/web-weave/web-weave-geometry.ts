// WebWeave GEOMETRY — the pure half of the brand web (docs/design/login-loading-screen.md §1/§4.1/§9;
// the waystone-geometry precedent: component-free maths so the canvas component stays thin and the
// build is vitest-unit-testable). Everything here is DETERMINISTIC per seed — the waystone sin-hash,
// no Math.random — so the same seed weaves the same web and a CT can assert geometry.
//
// The web is built the way a real orb-weaver builds one (the §1.1 choreography): bridge → Y-drop (the
// hub) → frame → radii laid one at a time ALTERNATING sides of the hub (tension balance) → a wide
// auxiliary scaffold spiral outward → the capture spiral laid rim-INWARD (consuming the scaffold),
// stopping short of the hub (the free zone) → settle (dew, glint, sway — the render module's beat).
//
// TIMING IS DATA, not CSS tokens (motion guide §4.3 forbids a 4th duration token, and a multi-phase
// canvas build isn't a CSS transition). The mock's timeline shipped at settle≈7.6s and the owner ruled
// the spider "turbo" — WEAVE_TIME_SCALE calms it (§9.4 tweak 2). The timeline never gates the veil's
// exit: the boot veil dissolves the instant the app is ready, mid-weave included (§9.3).

import { sagLine, weaveJitter } from "./web-weave-math.ts";

// ─── Types ───────────────────────────────────────────────────────────────────────────────────────

/** The web's display states (§4.1): `weaving` runs the build timeline; `settled` rests (ambient only);
 *  `partial` freezes at radii-complete (the B4 first-run "your server isn't fully spun" web);
 *  `strand-out` is settled + the A9 handoff beat (the spider rides a new silk line off-screen). */
export const WEAVE_STATES = ["weaving", "settled", "partial", "strand-out"] as const;
export type WeaveState = (typeof WEAVE_STATES)[number];

/** The build phases, in laying order — the boot veil's caption axis (§5.5 one importable union). */
const WEAVE_PHASES = ["bridge", "anchor", "frame", "radii", "scaffold", "capture", "settled"] as const;
export type WeavePhase = (typeof WEAVE_PHASES)[number];

export interface WeavePoint {
  readonly x: number;
  readonly y: number;
}

const STRAND_KINDS = ["bridge", "frame", "radius", "aux", "capture"] as const;
type StrandKind = (typeof STRAND_KINDS)[number];

/** One laid silk line: sampled points plus its birth window on the timeline. Spirals additionally
 *  carry a per-point birth time (`vt`) so the drawn extent ends exactly at the laying spider. */
export interface WeaveStrand {
  readonly kind: StrandKind;
  readonly pts: readonly WeavePoint[];
  readonly t0: number;
  readonly t1: number;
  readonly width: number;
  readonly vt?: readonly number[];
}

/** One dew droplet on the capture spiral: position + radius + its own twinkle phase/speed. */
export interface WeaveDewDrop {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly phase: number;
  readonly speed: number;
}

/** One leg of the spider's journey: walk `pts` from fraction `from` to `to` over [t0,t1]. `tip` legs
 *  instead track a spiral's laying tip (the drawn-extent end), which is not a constant-speed walk. */
export interface SpiderLeg {
  readonly t0: number;
  readonly t1: number;
  readonly pts: readonly WeavePoint[];
  readonly from: number;
  readonly to: number;
  readonly tip?: StrandKind;
}

export interface WovenWeb {
  readonly strands: readonly WeaveStrand[];
  readonly radii: readonly WeaveStrand[];
  readonly aux: WeaveStrand;
  readonly capture: WeaveStrand;
  readonly dew: readonly WeaveDewDrop[];
  readonly itinerary: readonly SpiderLeg[];
  readonly hub: WeavePoint;
  /** Mean hub→frame distance — the spiral scale + the free-zone base. */
  readonly reach: number;
  readonly freeZoneRadius: number;
}

// ─── The timeline (ms) — mock values × the owner's calm-down scale (§9.4 tweak 2) ────────────────

/** ×1.6 over the mock's 7.6s build → settle ≈ 12.2s. The build serves the wait; it never blocks the exit. */
const WEAVE_TIME_SCALE = 1.6;
const ms = (mockMs: number): number => Math.round(mockMs * WEAVE_TIME_SCALE);

/** The mock's beat BOUNDARIES (docs/design/mocks/login-loading/login-loading-mock.html), kept
 *  verbatim as the provenance record — each phase runs boundary→boundary; everything below derives
 *  through the calm-down scale. */
const MOCK_BEATS = {
  start: 0,
  bridgeCaught: 900,
  hubDropped: 1250,
  anchorDropped: 1650,
  frameClosed: 2400,
  radiiLaid: 4600,
  scaffoldLaid: 5600,
  captureLaid: 7600,
  /** The spider's zip home from the spiral's inner end to the hub after the last capture loop. */
  atRest: 8020,
} as const;

export const WEAVE_TIMELINE = {
  bridge: [ms(MOCK_BEATS.start), ms(MOCK_BEATS.bridgeCaught)],
  drop: [ms(MOCK_BEATS.bridgeCaught), ms(MOCK_BEATS.hubDropped)],
  anchorDrop: [ms(MOCK_BEATS.hubDropped), ms(MOCK_BEATS.anchorDropped)],
  frame: [ms(MOCK_BEATS.anchorDropped), ms(MOCK_BEATS.frameClosed)],
  radii: [ms(MOCK_BEATS.frameClosed), ms(MOCK_BEATS.radiiLaid)],
  aux: [ms(MOCK_BEATS.radiiLaid), ms(MOCK_BEATS.scaffoldLaid)],
  capture: [ms(MOCK_BEATS.scaffoldLaid), ms(MOCK_BEATS.captureLaid)],
  settle: ms(MOCK_BEATS.captureLaid),
  rest: ms(MOCK_BEATS.atRest),
} as const;

/** The caption phase at a timeline instant (the boot veil's `onPhaseChange` axis). */
export function weavePhaseAt(t: number): WeavePhase {
  if (t >= WEAVE_TIMELINE.settle) {
    return "settled";
  }
  if (t >= WEAVE_TIMELINE.capture[0]) {
    return "capture";
  }
  if (t >= WEAVE_TIMELINE.aux[0]) {
    return "scaffold";
  }
  if (t >= WEAVE_TIMELINE.radii[0]) {
    return "radii";
  }
  if (t >= WEAVE_TIMELINE.frame[0]) {
    return "frame";
  }
  if (t >= WEAVE_TIMELINE.drop[0]) {
    return "anchor";
  }
  return "bridge";
}

// ─── Web construction ────────────────────────────────────────────────────────────────────────────

const TAU = Math.PI * 2;
/** ~16 radii (§1.1) — enough spokes to read as an orb web, few enough to stay individually watchable. */
export const RADIUS_COUNT = 16;
/** Capture-spiral turns rim→free-zone; the density that reads "tight" without mushing at phone width. */
export const CAPTURE_TURNS = 9;
/** The wide-pitch scaffold the capture pass consumes. */
export const AUX_TURNS = 4.4;
/** The free zone: real orb webs keep the capture spiral clear of the hub. Fraction of mean reach. */
const FREE_ZONE_FRAC = 0.16;
/** Spiral radial extremes as fractions of mean reach (start of aux · rim of capture · capture's inner stop). */
const AUX_INNER_FRAC = 1.15;
const RIM_FRAC = 0.86;
const CAPTURE_STOP_FRAC = 1.35;
/** Spiral rings blend frame-following (fills the polygon) with circular (reads as a real orb): the
 *  0.62/0.38 split measured in the mock as the point where rings stop reading as a hard polygon. */
const SHAPE_ROUND = 0.62;
const SHAPE_FRAME = 0.38;
/** Per-ring radial wobble — hand-laid silk, not a compass arc. */
const SPIRAL_WOBBLE = 0.012;
/** Radius angle jitter (radians) around the even fan. */
const RADIUS_ANGLE_JITTER = 0.16;
/** Sag: control-point drop for a strand, per px of span (bridge sags visibly; radii barely). */
const BRIDGE_SAG_FRAC = 0.045;
const FRAME_SAG_PX = 4;
const RADIUS_SAG_MAX_PX = 6;
const RADIUS_SAG_PER_PX = 0.012;
/** Strand widths (px at DPR 1) — silk hierarchy: bridge heaviest, scaffold faintest. */
const WIDTH_BRIDGE = 1.15;
const WIDTH_FRAME = 1.0;
const WIDTH_RADIUS = 0.95;
const WIDTH_AUX = 0.55;
const WIDTH_CAPTURE = 0.8;
/** Sample densities. */
const BRIDGE_SAMPLES = 48;
const DROP_SAMPLES = 16;
const FRAME_SAMPLES = 20;
const RADIUS_SAMPLES = 22;
const SPIRAL_STEP_RAD = 0.11;
const SPIRAL_MIN_STEPS = 24;
/** Dew: every 5th spiral sample is a candidate; ~28% condense (jitter cutoff), sized/paced per drop. */
const DEW_STRIDE = 5;
const DEW_EDGE_SKIP = 6;
const DEW_CUTOFF = 0.72;
const DEW_R_BASE = 0.9;
const DEW_R_JITTER = 1.3;
const DEW_SPEED_BASE = 0.6;
const DEW_SPEED_JITTER = 0.9;
/** The radius fraction of its birth window spent laying outward; the rest zips home. */
const RADIUS_LAY_FRAC = 0.68;
/** Anchor points as fractions of the canvas box, relative to the hub line — the mock's pentagon. */
const ANCHORS = {
  bridgeLeft: { x: -0.06, dy: -0.3 },
  bridgeRight: { x: 1.06, dy: -0.33 },
  right: { x: 1.08, dy: 0.3 },
  bottom: { x: 0.58, dy: 0.72 },
  left: { x: -0.08, dy: 0.34 },
} as const;
/** Jitter channels (second hash arg) — named so two features never collide on a channel by accident. */
const CH_RADIUS_ANGLE = 3;
const CH_AUX_WOBBLE = 11;
const CH_CAPTURE_WOBBLE = 13;
const CH_DEW_PICK = 21;
const CH_DEW_R = 22;
const CH_DEW_PHASE = 23;
const CH_DEW_SPEED = 24;
/** The spider starts crossing the bridge partway through its float-and-catch beat (mock ms). */
const MOCK_BRIDGE_WALK_START = 550;
const MOCK_BRIDGE_WALK_END = 1000;
const BRIDGE_WALK_START = ms(MOCK_BRIDGE_WALK_START);
const BRIDGE_WALK_END = ms(MOCK_BRIDGE_WALK_END);
/** The bridge strand reads "caught" this long (mock ms) before its phase window closes. */
const MOCK_BRIDGE_CATCH_LEAD = 250;
/** Centering offset for a [0,1) jitter (jitter − HALF spans ±0.5). */
const HALF = 0.5;
/** Ray/segment parallelism epsilon. */
const EPSILON = 1e-9;
/** The Y-drop sags: the short bridge→hub line barely, the hub→anchor line visibly. */
const DROP_TOP_SAG_PX = 2;
const DROP_BOTTOM_SAG_PX = 5;
const DROP_BOTTOM_EXTRA_SAMPLES = 8;
const WIDTH_DROP = 1.1;
/** Radius tips stop just inside the frame strand (silk wraps, it doesn't overshoot). */
const RADIUS_TIP_INSET = 0.995;
/** Where on its circle the spiral pass begins (radians) — arbitrary but fixed, mock value. */
const SPIRAL_PHASE = 0.3;
/** Dew candidates skip the spiral's innermost samples too (no dew inside the near-free-zone run). */
const DEW_INNER_SKIP = 4;
/** The A9 strand-out line: overshoot past the edge, rise above the hub, sag, sampling. */
const STRAND_OUT_OVERSHOOT_PX = 80;
const STRAND_OUT_RISE_FRAC = 0.26;
const STRAND_OUT_MIN_Y = 40;
const STRAND_OUT_SAG_PX = 16;
const STRAND_OUT_SAMPLES = 30;

/** Ray (from `p` along `d`) vs segment `ab` → the ray parameter, or null when they miss. */
function raySegment(p: WeavePoint, d: WeavePoint, a: WeavePoint, b: WeavePoint): number | null {
  const den = d.x * (b.y - a.y) - d.y * (b.x - a.x);
  if (Math.abs(den) < EPSILON) {
    return null;
  }
  const qx = a.x - p.x;
  const qy = a.y - p.y;
  const t = (qx * (b.y - a.y) - qy * (b.x - a.x)) / den;
  const u = (qx * d.y - qy * d.x) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

export interface BuildWebInput {
  readonly width: number;
  readonly height: number;
  /** Hub position as canvas fractions (boot 0.5/0.42; login backdrop 0.5/0.34). */
  readonly hub: WeavePoint;
  readonly seed: number;
}

/** Build the whole web: strands with birth windows, dew, and the spider's itinerary. Pure. */
export function buildWeb({ width, height, hub: hubFrac, seed }: BuildWebInput): WovenWeb {
  const T = WEAVE_TIMELINE;
  const hub: WeavePoint = { x: hubFrac.x * width, y: hubFrac.y * height };
  const at = (a: { x: number; dy: number }): WeavePoint => ({ x: a.x * width, y: hub.y + a.dy * height });
  const bl = at(ANCHORS.bridgeLeft);
  const br = at(ANCHORS.bridgeRight);
  const poly: readonly WeavePoint[] = [bl, br, at(ANCHORS.right), at(ANCHORS.bottom), at(ANCHORS.left)];
  const rayToFrame = (angle: number): number => {
    const d = { x: Math.cos(angle), y: Math.sin(angle) };
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as WeavePoint;
      const b = poly[(i + 1) % poly.length] as WeavePoint;
      const t = raySegment(hub, d, a, b);
      if (t !== null && t < best) {
        best = t;
      }
    }
    return Number.isFinite(best) ? best : Math.max(width, height);
  };

  const strands: WeaveStrand[] = [];
  // The bridge — floats wavy, then catches (the render module paints the float; geometry is the taut line).
  const bridgePts = sagLine(bl, br, BRIDGE_SAG_FRAC * height, BRIDGE_SAMPLES);
  strands.push({ kind: "bridge", pts: bridgePts, t0: T.bridge[0], t1: T.bridge[1] - ms(MOCK_BRIDGE_CATCH_LEAD), width: WIDTH_BRIDGE });
  // The Y: drop from the bridge point nearest the hub's x down to the hub, then hub → bottom anchor.
  let bridgeMid = bridgePts[0] as WeavePoint;
  for (const p of bridgePts) {
    if (Math.abs(p.x - hub.x) < Math.abs(bridgeMid.x - hub.x)) {
      bridgeMid = p;
    }
  }
  const dropTop = sagLine(bridgeMid, hub, DROP_TOP_SAG_PX, DROP_SAMPLES);
  const dropBottom = sagLine(hub, at(ANCHORS.bottom), DROP_BOTTOM_SAG_PX, DROP_SAMPLES + DROP_BOTTOM_EXTRA_SAMPLES);
  strands.push({ kind: "frame", pts: dropTop, t0: T.drop[0], t1: T.drop[1], width: WIDTH_DROP });
  strands.push({ kind: "frame", pts: dropBottom, t0: T.anchorDrop[0], t1: T.anchorDrop[1], width: WIDTH_DROP });
  // Frame edges close the perimeter.
  const edges: readonly (readonly [WeavePoint, WeavePoint])[] = [
    [bl, at(ANCHORS.left)],
    [at(ANCHORS.left), at(ANCHORS.bottom)],
    [at(ANCHORS.bottom), at(ANCHORS.right)],
    [at(ANCHORS.right), br],
  ];
  const frameSlice = (T.frame[1] - T.frame[0]) / edges.length;
  edges.forEach(([a, b], i) => {
    strands.push({
      kind: "frame",
      pts: sagLine(a, b, FRAME_SAG_PX, FRAME_SAMPLES),
      t0: T.frame[0] + i * frameSlice,
      t1: T.frame[0] + (i + 1) * frameSlice,
      width: WIDTH_FRAME,
    });
  });

  // Radii — one at a time, alternating sides of the hub (real spiders balance tension).
  const angles: number[] = [];
  for (let i = 0; i < RADIUS_COUNT; i++) {
    angles.push((i / RADIUS_COUNT) * TAU + (weaveJitter(i, CH_RADIUS_ANGLE, seed) - HALF) * RADIUS_ANGLE_JITTER);
  }
  const layingOrder: number[] = [];
  for (let k = 0; k < RADIUS_COUNT / 2; k++) {
    layingOrder.push(k, k + RADIUS_COUNT / 2);
  }
  const radiusSlice = (T.radii[1] - T.radii[0]) / RADIUS_COUNT;
  const radii: WeaveStrand[] = [];
  const radiusZips: number[] = [];
  layingOrder.forEach((angleIndex, orderIndex) => {
    const angle = angles[angleIndex] as number;
    const len = rayToFrame(angle) * RADIUS_TIP_INSET;
    const end = { x: hub.x + Math.cos(angle) * len, y: hub.y + Math.sin(angle) * len };
    const t0 = T.radii[0] + orderIndex * radiusSlice;
    const strand: WeaveStrand = {
      kind: "radius",
      pts: sagLine(hub, end, Math.min(RADIUS_SAG_MAX_PX, len * RADIUS_SAG_PER_PX), RADIUS_SAMPLES),
      t0,
      t1: t0 + radiusSlice * RADIUS_LAY_FRAC,
      width: WIDTH_RADIUS,
    };
    strands.push(strand);
    radii.push(strand);
    radiusZips.push(t0 + radiusSlice);
  });

  // Spirals — frame-shaped but rounded; per-point birth times so the tip IS the spider.
  const reach = angles.reduce((sum, a) => sum + rayToFrame(a), 0) / RADIUS_COUNT;
  const freeZoneRadius = reach * FREE_ZONE_FRAC;
  const shape = (angle: number): number => SHAPE_ROUND + SHAPE_FRAME * (rayToFrame(angle) / reach);
  interface SpiralSpec {
    readonly kind: "aux" | "capture";
    readonly t0: number;
    readonly t1: number;
    readonly thFrom: number;
    readonly thTo: number;
    readonly rFrom: number;
    readonly rTo: number;
    readonly strokeWidth: number;
  }
  const spiral = ({ kind, t0, t1, thFrom, thTo, rFrom, rTo, strokeWidth }: SpiralSpec): WeaveStrand => {
    const pts: WeavePoint[] = [];
    const vt: number[] = [];
    const steps = Math.max(SPIRAL_MIN_STEPS, Math.round(Math.abs(thTo - thFrom) / SPIRAL_STEP_RAD));
    const channel = kind === "aux" ? CH_AUX_WOBBLE : CH_CAPTURE_WOBBLE;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const th = thFrom + (thTo - thFrom) * s;
      const r = (rFrom + (rTo - rFrom) * s) * shape(th) * (1 + (weaveJitter(i, channel, seed) - HALF) * SPIRAL_WOBBLE);
      pts.push({ x: hub.x + Math.cos(th) * r, y: hub.y + Math.sin(th) * r });
      vt.push(t0 + (t1 - t0) * s);
    }
    return { kind, pts, vt, t0, t1, width: strokeWidth };
  };
  const aux = spiral({
    kind: "aux",
    t0: T.aux[0],
    t1: T.aux[1],
    thFrom: SPIRAL_PHASE,
    thTo: SPIRAL_PHASE + AUX_TURNS * TAU,
    rFrom: freeZoneRadius * AUX_INNER_FRAC,
    rTo: reach * RIM_FRAC,
    strokeWidth: WIDTH_AUX,
  });
  const capture = spiral({
    kind: "capture",
    t0: T.capture[0],
    t1: T.capture[1],
    thFrom: SPIRAL_PHASE + AUX_TURNS * TAU,
    thTo: SPIRAL_PHASE + AUX_TURNS * TAU - CAPTURE_TURNS * TAU,
    rFrom: reach * RIM_FRAC,
    rTo: freeZoneRadius * CAPTURE_STOP_FRAC,
    strokeWidth: WIDTH_CAPTURE,
  });
  strands.push(aux, capture);

  // Dew — deterministic points on the capture spiral; the render module condenses them on settle.
  const dew: WeaveDewDrop[] = [];
  for (let i = DEW_EDGE_SKIP; i < capture.pts.length - DEW_INNER_SKIP; i += DEW_STRIDE) {
    if (weaveJitter(i, CH_DEW_PICK, seed) > DEW_CUTOFF) {
      const p = capture.pts[i] as WeavePoint;
      dew.push({
        x: p.x,
        y: p.y,
        r: DEW_R_BASE + weaveJitter(i, CH_DEW_R, seed) * DEW_R_JITTER,
        phase: weaveJitter(i, CH_DEW_PHASE, seed) * TAU,
        speed: DEW_SPEED_BASE + weaveJitter(i, CH_DEW_SPEED, seed) * DEW_SPEED_JITTER,
      });
    }
  }

  // The spider's itinerary — where the weaver is at any t on the build timeline.
  const itinerary: SpiderLeg[] = [];
  itinerary.push({ t0: BRIDGE_WALK_START, t1: BRIDGE_WALK_END, pts: bridgePts, from: 0, to: bridgePts.indexOf(bridgeMid) / (bridgePts.length - 1) });
  itinerary.push({ t0: T.drop[0], t1: T.drop[1], pts: dropTop, from: 0, to: 1 });
  itinerary.push({ t0: T.anchorDrop[0], t1: T.anchorDrop[1], pts: dropBottom, from: 0, to: 1 });
  itinerary.push({ t0: T.frame[0], t1: T.frame[1], pts: dropBottom, from: 1, to: 0 });
  radii.forEach((strand, i) => {
    itinerary.push({ t0: strand.t0, t1: strand.t1, pts: strand.pts, from: 0, to: 1 });
    itinerary.push({ t0: strand.t1, t1: radiusZips[i] as number, pts: strand.pts, from: 1, to: 0 });
  });
  itinerary.push({ t0: aux.t0, t1: aux.t1, pts: aux.pts, from: 0, to: 1, tip: "aux" });
  itinerary.push({ t0: capture.t0, t1: capture.t1, pts: capture.pts, from: 0, to: 1, tip: "capture" });
  itinerary.push({ t0: T.capture[1], t1: T.rest, pts: [capture.pts.at(-1) as WeavePoint, hub], from: 0, to: 1 });

  return { strands, radii, aux, capture, dew, itinerary, hub, reach, freeZoneRadius };
}

/** The A9 strand-out silk line: hub → off the top-right edge, sagging — steeper than the bridge so the
 *  handoff reads as ITS OWN strand (§3). Pure; the render module animates the ride. */
export function buildStrandOut(web: WovenWeb, width: number, height: number): readonly WeavePoint[] {
  const end = { x: width + STRAND_OUT_OVERSHOOT_PX, y: Math.max(web.hub.y - STRAND_OUT_RISE_FRAC * height, STRAND_OUT_MIN_Y) };
  return sagLine(web.hub, end, STRAND_OUT_SAG_PX, STRAND_OUT_SAMPLES);
}
