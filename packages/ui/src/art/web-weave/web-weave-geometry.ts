// WebWeave GEOMETRY — the pure half of the brand web (docs/design/login-loading-screen.md §1/§4.1/§9;
// the waystone-geometry precedent: component-free maths so the canvas component stays thin and the
// build is vitest-unit-testable). Everything here is DETERMINISTIC per seed — the waystone sin-hash,
// no Math.random — so the same seed weaves the same web and a CT can assert geometry.
//
// The web is built the way a real orb-weaver builds one (the §1.1 choreography): bridge → Y-drop (the
// hub) → frame → radii laid one at a time ALTERNATING sides of the hub (tension balance) → a wide
// auxiliary scaffold spiral outward → the capture spiral laid rim-INWARD (consuming the scaffold),
// stopping short of the hub (the free zone) → settle (dew, glint, sway — the render module's beat).
// The WEAVER LAYS IT HERSELF: the itinerary below walks her over every strand as it is born, frame
// edges included (weave-lab-upgrades.md §3 — silk that appears unattended reads as a screensaver).
//
// The beat map lives in web-weave-timeline.ts (WHEN); this module is WHERE.

import { nearestRayHit, polylineLength, sagLine, toSegments, weaveJitter } from "./web-weave-math.ts";
import { BRIDGE_CATCH_LEAD, BRIDGE_WALK_START, WEAVE_TIMELINE } from "./web-weave-timeline.ts";

// ─── Types ───────────────────────────────────────────────────────────────────────────────────────

/** The web's display states (§4.1): `weaving` runs the build timeline; `settled` rests (ambient only);
 *  `partial` freezes at radii-complete (the B4 first-run "your server isn't fully spun" web);
 *  `strand-out` is settled + the A9 handoff beat (the spider rides a new silk line off-screen). */
export const WEAVE_STATES = ["weaving", "settled", "partial", "strand-out"] as const;
export type WeaveState = (typeof WEAVE_STATES)[number];

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
  /** Polyline arc length (px) — the physics module's pluck wave travels in REAL distance along the
   *  silk, not in sample-index space, so a 22-sample radius and a 500-sample spiral ring the same. */
  readonly length: number;
}

/** One dew droplet on the capture spiral: position + radius + its own twinkle phase/speed, plus the
 *  capture SAMPLE it hangs from — a drop rides whatever that sample is doing (sway, and a pluck's
 *  ring), or it floats off the silk the moment the web moves. */
export interface WeaveDewDrop {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly phase: number;
  readonly speed: number;
  readonly index: number;
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
  /** The seed this web was woven from — carried so the ambient beats keyed off it (her idle twitches)
   *  stay deterministic per web without the painters re-deriving it. */
  readonly seed: number;
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
/** Her route round the frame, as fractions of the frame beat: lay the lower-left edge, the upper-left
 *  edge, walk BACK down both (the gap), lay the lower-right, the upper-right, then ride the bridge home
 *  and drop to the hub (the last gap). One set of numbers — the strand births and her legs share them. */
const FRAME_LEG_LEFT_LOWER = 0.18;
const FRAME_LEG_LEFT_UPPER = 0.36;
const FRAME_LEG_BACK_MID = 0.42;
const FRAME_LEG_RIGHT_START = 0.48;
const FRAME_LEG_RIGHT_LOWER = 0.66;
const FRAME_LEG_RIGHT_UPPER = 0.84;
const FRAME_LEG_BRIDGE_HOME = 0.93;
/** The scaffold starts a free-zone radius OUT from the hub, and the last radius left her AT the hub —
 *  so the first slice of the scaffold beat is her walking out to its inner end. Without it she jumps
 *  ~100px and the scaffold's first ring is spun by nobody (weave-lab §3: no unattended silk). */
const AUX_WALK_OUT_FRAC = 0.08;
/** Centering offset for a [0,1) jitter (jitter − HALF spans ±0.5). */
const HALF = 0.5;
/** The Y-drop sags: the short bridge→hub line barely, the hub→anchor line visibly. */
const DROP_TOP_SAG_PX = 2;
const DROP_BOTTOM_SAG_PX = 5;
const DROP_BOTTOM_EXTRA_SAMPLES = 8;
const WIDTH_DROP = 1.1;
/** Radius tips stop just inside the frame strand (silk wraps, it doesn't overshoot). */
const RADIUS_TIP_INSET = 0.995;
/** …but a radius the BOX stopped (its anchor is off-screen) runs PAST the edge by this much instead: a
 *  strand cut off by the canvas reads as continuing to an anchor you cannot see, whereas a tip parked a
 *  few px inside the edge reads as broken silk. Termination is therefore per-constraint, not one clamp. */
const RADIUS_CROP_OVERSHOOT_PX = 14;
/** The interior silk (radii + spirals) is CONTAINED: the host rect inset by this margin joins the ray
 *  caster, so nothing is chopped by the canvas edge at an extreme aspect ratio. The margin covers the
 *  ambient sway (±2.1px), the widest stroke, and a dew halo. The frame + bridge ANCHORS still leave the
 *  box by design — the web is a fragment of a bigger one. */
const EDGE_MARGIN = 7;
/** Belt to the caster's braces: every spiral sample is additionally clamped to this fraction of its own
 *  bounding ray, so the rounding blend (SHAPE_ROUND/SHAPE_FRAME) can never push a ring past the edge. */
const SPIRAL_EDGE_FRAC = 0.94;
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

  const strands: WeaveStrand[] = [];
  /** Lay a strand: stamp its arc length (the physics module travels waves in real px) and file it. */
  const lay = (strand: Omit<WeaveStrand, "length">): WeaveStrand => {
    const laid: WeaveStrand = { ...strand, length: polylineLength(strand.pts) };
    strands.push(laid);
    return laid;
  };
  // The bridge — floats wavy, then catches (the render module paints the float; geometry is the taut line).
  const bridgePts = sagLine(bl, br, BRIDGE_SAG_FRAC * height, BRIDGE_SAMPLES);
  lay({ kind: "bridge", pts: bridgePts, t0: T.bridge[0], t1: T.bridge[1] - BRIDGE_CATCH_LEAD, width: WIDTH_BRIDGE });
  // The Y: drop from the bridge point nearest the hub's x down to the hub, then hub → bottom anchor.
  let bridgeMid = bridgePts[0] as WeavePoint;
  for (const p of bridgePts) {
    if (Math.abs(p.x - hub.x) < Math.abs(bridgeMid.x - hub.x)) {
      bridgeMid = p;
    }
  }
  const dropTop = sagLine(bridgeMid, hub, DROP_TOP_SAG_PX, DROP_SAMPLES);
  const dropBottom = sagLine(hub, at(ANCHORS.bottom), DROP_BOTTOM_SAG_PX, DROP_SAMPLES + DROP_BOTTOM_EXTRA_SAMPLES);
  lay({ kind: "frame", pts: dropTop, t0: T.drop[0], t1: T.drop[1], width: WIDTH_DROP });
  lay({ kind: "frame", pts: dropBottom, t0: T.anchorDrop[0], t1: T.anchorDrop[1], width: WIDTH_DROP });
  // The frame, in the order SHE can actually walk it (weave-lab §3): the anchor drop leaves her at the
  // bottom anchor, so she lays bottom→left, left→bridge-left corner, WALKS BACK down, then
  // bottom→right, right→bridge-right, and rides the bridge home. Each edge's birth window is the slice
  // of the frame beat she spends on it — the gaps between them are her walk-backs (see the itinerary).
  const frameAt = (from: number, to: number): readonly [number, number] => [
    T.frame[0] + (T.frame[1] - T.frame[0]) * from,
    T.frame[0] + (T.frame[1] - T.frame[0]) * to,
  ];
  const edges: readonly (readonly [WeavePoint, WeavePoint, number, number])[] = [
    [at(ANCHORS.bottom), at(ANCHORS.left), 0, FRAME_LEG_LEFT_LOWER],
    [at(ANCHORS.left), bl, FRAME_LEG_LEFT_LOWER, FRAME_LEG_LEFT_UPPER],
    [at(ANCHORS.bottom), at(ANCHORS.right), FRAME_LEG_RIGHT_START, FRAME_LEG_RIGHT_LOWER],
    [at(ANCHORS.right), br, FRAME_LEG_RIGHT_LOWER, FRAME_LEG_RIGHT_UPPER],
  ];
  // The DRAWN boundary silk (bridge + the four sagged frame edges) — the radii and spirals terminate on
  // THESE polylines, never on the ideal anchor polygon they sag away from (motion-fixes §1: a tip cast
  // at the straight chord floats a sag's worth off the silk it should be tied to).
  const framePolys: (readonly WeavePoint[])[] = [bridgePts];
  const edgePts = edges.map(([a, b, from, to]) => {
    const pts = sagLine(a, b, FRAME_SAG_PX, FRAME_SAMPLES);
    framePolys.push(pts);
    const [t0, t1] = frameAt(from, to);
    lay({ kind: "frame", pts, t0, t1, width: WIDTH_FRAME });
    return pts;
  });
  // …and the containment box joins the same caster as four more segments (motion-fixes §2).
  const box: readonly WeavePoint[] = [
    { x: EDGE_MARGIN, y: EDGE_MARGIN },
    { x: width - EDGE_MARGIN, y: EDGE_MARGIN },
    { x: width - EDGE_MARGIN, y: height - EDGE_MARGIN },
    { x: EDGE_MARGIN, y: height - EDGE_MARGIN },
  ];
  const silkSegments = framePolys.flatMap((poly) => toSegments(poly));
  const boxSegments = toSegments(box, true);
  /** Hub→boundary distances along `angle`, kept SEPARATE: which constraint bound decides how a radius
   *  terminates (silk → tuck just inside it; box → run past the edge), while `len` is the bound the
   *  spirals live inside. */
  const rayHit = (angle: number): { frame: number; rect: number; len: number } => {
    const d = { x: Math.cos(angle), y: Math.sin(angle) };
    const frame = nearestRayHit(hub, d, silkSegments);
    const rect = nearestRayHit(hub, d, boxSegments);
    const len = Math.min(frame, rect);
    return { frame, rect, len: Number.isFinite(len) ? len : Math.max(width, height) };
  };

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
    const hit = rayHit(angle);
    // Silk bound it → tuck the tip just inside the strand. The BOX bound it → the anchor is off-screen,
    // so cross the edge and let the canvas crop it.
    const len = hit.rect < hit.frame ? hit.rect + RADIUS_CROP_OVERSHOOT_PX : hit.len * RADIUS_TIP_INSET;
    const end = { x: hub.x + Math.cos(angle) * len, y: hub.y + Math.sin(angle) * len };
    const t0 = T.radii[0] + orderIndex * radiusSlice;
    const strand = lay({
      kind: "radius",
      pts: sagLine(hub, end, Math.min(RADIUS_SAG_MAX_PX, len * RADIUS_SAG_PER_PX), RADIUS_SAMPLES),
      t0,
      t1: t0 + radiusSlice * RADIUS_LAY_FRAC,
      width: WIDTH_RADIUS,
    });
    radii.push(strand);
    radiusZips.push(t0 + radiusSlice);
  });

  // Spirals — frame-shaped but rounded; per-point birth times so the tip IS the spider.
  const reach = angles.reduce((sum, a) => sum + rayHit(a).len, 0) / RADIUS_COUNT;
  const freeZoneRadius = reach * FREE_ZONE_FRAC;
  /** The ring blend at an angle whose bounding ray is already known (one cast per spiral sample). */
  const shapeFor = (ray: number): number => SHAPE_ROUND + SHAPE_FRAME * (ray / reach);
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
  const spiral = ({ kind, t0, t1, thFrom, thTo, rFrom, rTo, strokeWidth }: SpiralSpec): Omit<WeaveStrand, "length"> => {
    const pts: WeavePoint[] = [];
    const vt: number[] = [];
    const steps = Math.max(SPIRAL_MIN_STEPS, Math.round(Math.abs(thTo - thFrom) / SPIRAL_STEP_RAD));
    const channel = kind === "aux" ? CH_AUX_WOBBLE : CH_CAPTURE_WOBBLE;
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const th = thFrom + (thTo - thFrom) * s;
      const ray = rayHit(th).len;
      const wobbled = (rFrom + (rTo - rFrom) * s) * shapeFor(ray) * (1 + (weaveJitter(i, channel, seed) - HALF) * SPIRAL_WOBBLE);
      const r = Math.min(wobbled, ray * SPIRAL_EDGE_FRAC);
      pts.push({ x: hub.x + Math.cos(th) * r, y: hub.y + Math.sin(th) * r });
      vt.push(t0 + (t1 - t0) * s);
    }
    return { kind, pts, vt, t0, t1, width: strokeWidth };
  };
  const auxWalkOutEnd = T.aux[0] + (T.aux[1] - T.aux[0]) * AUX_WALK_OUT_FRAC;
  const aux = lay(
    spiral({
      kind: "aux",
      t0: auxWalkOutEnd,
      t1: T.aux[1],
      thFrom: SPIRAL_PHASE,
      thTo: SPIRAL_PHASE + AUX_TURNS * TAU,
      rFrom: freeZoneRadius * AUX_INNER_FRAC,
      rTo: reach * RIM_FRAC,
      strokeWidth: WIDTH_AUX,
    }),
  );
  const capture = lay(
    spiral({
      kind: "capture",
      t0: T.capture[0],
      t1: T.capture[1],
      thFrom: SPIRAL_PHASE + AUX_TURNS * TAU,
      thTo: SPIRAL_PHASE + AUX_TURNS * TAU - CAPTURE_TURNS * TAU,
      rFrom: reach * RIM_FRAC,
      rTo: freeZoneRadius * CAPTURE_STOP_FRAC,
      strokeWidth: WIDTH_CAPTURE,
    }),
  );

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
        index: i,
      });
    }
  }

  // The spider's itinerary — where the weaver is at any t on the build timeline.
  const itinerary: SpiderLeg[] = [];
  const bridgeMidFrac = bridgePts.indexOf(bridgeMid) / (bridgePts.length - 1);
  // The walk hands off EXACTLY at the drop beat — legs must abut, never overlap (the lookup is
  // first-match, so an overlap silently switches legs mid-walk).
  itinerary.push({ t0: BRIDGE_WALK_START, t1: T.drop[0], pts: bridgePts, from: 0, to: bridgeMidFrac });
  itinerary.push({ t0: T.drop[0], t1: T.drop[1], pts: dropTop, from: 0, to: 1 });
  itinerary.push({ t0: T.anchorDrop[0], t1: T.anchorDrop[1], pts: dropBottom, from: 0, to: 1 });
  // …the frame, walked edge by edge as she spins it (the birth windows above are these same slices).
  const frameLeg = (beat: readonly [number, number], pts: readonly WeavePoint[], walk: readonly [number, number]): void => {
    const [t0, t1] = frameAt(beat[0], beat[1]);
    itinerary.push({ t0, t1, pts, from: walk[0], to: walk[1] });
  };
  const [lowerLeft, upperLeft, lowerRight, upperRight] = edgePts as readonly (readonly WeavePoint[])[];
  const outward = [0, 1] as const;
  const backward = [1, 0] as const;
  frameLeg([0, FRAME_LEG_LEFT_LOWER], lowerLeft as readonly WeavePoint[], outward);
  frameLeg([FRAME_LEG_LEFT_LOWER, FRAME_LEG_LEFT_UPPER], upperLeft as readonly WeavePoint[], outward);
  frameLeg([FRAME_LEG_LEFT_UPPER, FRAME_LEG_BACK_MID], upperLeft as readonly WeavePoint[], backward);
  frameLeg([FRAME_LEG_BACK_MID, FRAME_LEG_RIGHT_START], lowerLeft as readonly WeavePoint[], backward);
  frameLeg([FRAME_LEG_RIGHT_START, FRAME_LEG_RIGHT_LOWER], lowerRight as readonly WeavePoint[], outward);
  frameLeg([FRAME_LEG_RIGHT_LOWER, FRAME_LEG_RIGHT_UPPER], upperRight as readonly WeavePoint[], outward);
  frameLeg([FRAME_LEG_RIGHT_UPPER, FRAME_LEG_BRIDGE_HOME], bridgePts, [1, bridgeMidFrac]);
  frameLeg([FRAME_LEG_BRIDGE_HOME, 1], dropTop, outward);
  radii.forEach((strand, i) => {
    itinerary.push({ t0: strand.t0, t1: strand.t1, pts: strand.pts, from: 0, to: 1 });
    itinerary.push({ t0: strand.t1, t1: radiusZips[i] as number, pts: strand.pts, from: 1, to: 0 });
  });
  // She walks OUT to the scaffold's inner end before spinning it (nothing is laid during this leg).
  itinerary.push({ t0: T.aux[0], t1: auxWalkOutEnd, pts: [hub, aux.pts[0] as WeavePoint], from: 0, to: 1 });
  itinerary.push({ t0: aux.t0, t1: aux.t1, pts: aux.pts, from: 0, to: 1, tip: "aux" });
  itinerary.push({ t0: capture.t0, t1: capture.t1, pts: capture.pts, from: 0, to: 1, tip: "capture" });
  itinerary.push({ t0: T.capture[1], t1: T.rest, pts: [capture.pts.at(-1) as WeavePoint, hub], from: 0, to: 1 });

  return { strands, radii, aux, capture, dew, itinerary, hub, reach, freeZoneRadius, seed };
}

/** The A9 strand-out silk line: hub → off the top-right edge, sagging — steeper than the bridge so the
 *  handoff reads as ITS OWN strand (§3). Pure; the render module animates the ride. */
export function buildStrandOut(web: WovenWeb, width: number, height: number): readonly WeavePoint[] {
  const end = { x: width + STRAND_OUT_OVERSHOOT_PX, y: Math.max(web.hub.y - STRAND_OUT_RISE_FRAC * height, STRAND_OUT_MIN_Y) };
  return sagLine(web.hub, end, STRAND_OUT_SAG_PX, STRAND_OUT_SAMPLES);
}
