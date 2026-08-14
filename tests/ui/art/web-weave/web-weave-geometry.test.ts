// The web-weave geometry (docs/design/login-loading-screen.md §1/§9.8) — the pure half's contract:
//   • DETERMINISM — the same seed weaves byte-identical geometry (the CT-assertable-web promise);
//     a different seed genuinely varies it (the jitter is live, not decorative).
//   • CHOREOGRAPHY — the real orb-weaver build order holds as data: bridge → drop → frame → radii →
//     aux scaffold → capture, each phase window monotonic, the caption axis matching it.
//   • WEB SHAPE — 16 radii; the capture spiral is laid RIM-INWARD and STOPS SHORT of the hub (the
//     free zone — the one biological invariant the design calls out); dew condenses ON the spiral.
//   • THE GLYPH — the condensed mark: spokes/turns per cut, an OPEN spiral with a real arc length
//     (WebSpinner's dash period), the dew at its named fraction, 24-space emission for the icon seal.

import type { WeavePoint, WovenWeb } from "@orb/ui/web-weave";
import {
  buildStrandOut,
  buildWeb,
  RADIUS_COUNT,
  WEAVE_TIMELINE,
  WEB_GLYPH_COMPACT,
  WEB_GLYPH_DISPLAY,
  weaveJitter,
  weavePhaseAt,
  webGlyph,
} from "@orb/ui/web-weave";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const BOX = { width: 1280, height: 800, hub: { x: 0.5, y: 0.42 }, seed: 7 } as const;
/** Hosts whose aspect is far from the mock's — the login card at phone width, a wide-short banner. */
const WIDE_SHORT = { width: 560, height: 140, hub: { x: 0.5, y: 0.42 }, seed: 7 } as const;
const TALL_NARROW = { width: 210, height: 380, hub: { x: 0.5, y: 0.34 }, seed: 7 } as const;
/** Overshoot tolerance: silk is ~1px wide, so a tip a pixel past the line still reads as tied to it. */
const ATTACHED_PX = 1;
/** A radius stops deliberately SHORT of the boundary (the tip inset — silk wraps, it doesn't overhang).
 *  A percent of the ray is the ceiling on that: enough for the half-percent inset, far too tight for a
 *  tip that terminated on a different line than the one it is drawn against. */
const TIP_INSET_MAX_FRAC = 0.01;
/** A radius aimed at an off-screen anchor is CROPPED: it crosses the host-box boundary, landing within
 *  a narrow band either side of it (the containment margin on the inside, the deliberate crop overshoot
 *  on the outside). Wide enough not to pin either constant, narrow enough that a tip left in open canvas
 *  — or one flying out to the ideal anchor polygon, the shipped defect — fails. */
const CROP_BAND_PX = 12;

const dist = (a: WeavePoint, b: WeavePoint): number => Math.hypot(a.x - b.x, a.y - b.y);

/** The DRAWN boundary silk: the bridge plus the four frame edges (the two Y-drop strands are interior
 *  lines — they share `kind: "frame"` but are born in the drop/anchor windows, before the frame's). */
function boundaryPolylines(web: WovenWeb): readonly (readonly WeavePoint[])[] {
  return web.strands.filter((s) => s.kind === "bridge" || (s.kind === "frame" && s.t0 >= WEAVE_TIMELINE.frame[0])).map((s) => s.pts);
}

/** Ray (hub, angle) vs one segment → the ray parameter, or null. The test's own caster: it answers
 *  "where does the DRAWN silk actually sit along this radius", independent of the module's maths. */
function raySegment(hub: WeavePoint, angle: number, a: WeavePoint, b: WeavePoint): number | null {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const den = dx * (b.y - a.y) - dy * (b.x - a.x);
  if (Math.abs(den) < 1e-9) {
    return null;
  }
  const qx = a.x - hub.x;
  const qy = a.y - hub.y;
  const t = (qx * (b.y - a.y) - qy * (b.x - a.x)) / den;
  const u = (qx * dy - qy * dx) / den;
  return t > 0 && u >= 0 && u <= 1 ? t : null;
}

/** Distance from the hub to the nearest DRAWN boundary-silk crossing along `angle` (null: none). */
function silkDistance(web: WovenWeb, angle: number): number | null {
  let best: number | null = null;
  for (const poly of boundaryPolylines(web)) {
    for (let i = 0; i < poly.length - 1; i++) {
      const t = raySegment(web.hub, angle, poly[i] as WeavePoint, poly[i + 1] as WeavePoint);
      if (t !== null && (best === null || t < best)) {
        best = t;
      }
    }
  }
  return best;
}

const inBox = (p: WeavePoint, w: number, h: number): boolean => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;

/** Where one radius ENDED, as a verdict. Two endings are correct: TIED to the drawn silk (a tip-inset's
 *  hair short of it), or CROPPED — cut by the canvas edge, which reads as a strand running on to an
 *  anchor off-screen. `dangling` is the failure: a tip stopped in open canvas, tied to nothing. */
const TIP_VERDICTS = ["on-silk", "cropped", "dangling"] as const;
type TipVerdict = (typeof TIP_VERDICTS)[number];

function classifyTip(web: WovenWeb, tip: WeavePoint, host: { width: number; height: number }): { verdict: TipVerdict; gap: number | null; edgeGap: number } {
  const angle = Math.atan2(tip.y - web.hub.y, tip.x - web.hub.x);
  const silk = silkDistance(web, angle);
  // How far short of the drawn silk it stopped (negative = past it), and its signed depth inside the
  // host box (negative = beyond the edge, i.e. cropped).
  const gap = silk === null ? null : silk - dist(tip, web.hub);
  const edgeGap = Math.min(tip.x, tip.y, host.width - tip.x, host.height - tip.y);
  if (silk !== null && gap !== null && gap >= 0 && gap <= silk * TIP_INSET_MAX_FRAC) {
    return { verdict: "on-silk", gap, edgeGap };
  }
  return { verdict: Math.abs(edgeGap) <= CROP_BAND_PX ? "cropped" : "dangling", gap, edgeGap };
}

describe("buildWeb — determinism", () => {
  test("the same seed weaves the identical web; a different seed weaves a different one", () => {
    const a = buildWeb(BOX);
    const b = buildWeb(BOX);
    expect(JSON.stringify(a.strands)).toBe(JSON.stringify(b.strands));
    expect(JSON.stringify(a.dew)).toBe(JSON.stringify(b.dew));
    const other = buildWeb({ ...BOX, seed: 8 });
    expect(JSON.stringify(other.radii)).not.toBe(JSON.stringify(a.radii));
  });

  test("weaveJitter is stable per (a,b,seed) and lives in [0,1)", () => {
    for (let i = 0; i < 50; i++) {
      const v = weaveJitter(i, 3, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      expect(weaveJitter(i, 3, 7)).toBe(v);
    }
    expect(weaveJitter(1, 2, 7)).not.toBe(weaveJitter(1, 2, 8));
  });
});

describe("buildWeb — the choreography as data", () => {
  const web = buildWeb(BOX);

  test("lays exactly RADIUS_COUNT radii, every one born inside the radii phase", () => {
    expect(web.radii).toHaveLength(RADIUS_COUNT);
    for (const r of web.radii) {
      expect(r.t0).toBeGreaterThanOrEqual(WEAVE_TIMELINE.radii[0]);
      expect(r.t1).toBeLessThanOrEqual(WEAVE_TIMELINE.radii[1]);
      // Every radius starts AT the hub (they are laid hub → frame).
      expect(dist(r.pts[0] as WeavePoint, web.hub)).toBeLessThan(1);
    }
  });

  test("the capture spiral runs rim-INWARD and stops short of the hub (the free zone)", () => {
    const pts = web.capture.pts;
    const first = dist(pts[0] as WeavePoint, web.hub);
    const last = dist(pts.at(-1) as WeavePoint, web.hub);
    expect(first).toBeGreaterThan(last); // laid from the rim toward the hub
    expect(last).toBeGreaterThanOrEqual(web.freeZoneRadius); // …but never into the free zone
    // And its per-point birth times are monotonic (the tip IS the spider).
    const vt = web.capture.vt as readonly number[];
    for (let i = 1; i < vt.length; i++) {
      expect(vt[i] as number).toBeGreaterThanOrEqual(vt[i - 1] as number);
    }
  });

  test("dew condenses ON the capture spiral", () => {
    expect(web.dew.length).toBeGreaterThan(3);
    for (const drop of web.dew) {
      const onSpiral = web.capture.pts.some((p) => dist(p, drop) < 0.001);
      expect(onSpiral).toBe(true);
    }
  });

  test("the spider's itinerary covers the whole build without gaps at phase boundaries", () => {
    // Every timeline instant from the first walk to the rest beat has SOME leg claiming it.
    const start = web.itinerary[0]?.t0 as number;
    for (let t = start; t < WEAVE_TIMELINE.rest; t += 200) {
      expect(web.itinerary.some((leg) => t >= leg.t0 && t <= leg.t1)).toBe(true);
    }
  });

  test("the caption axis matches the timeline windows", () => {
    expect(weavePhaseAt(0)).toBe("bridge");
    expect(weavePhaseAt(WEAVE_TIMELINE.drop[0])).toBe("anchor");
    expect(weavePhaseAt(WEAVE_TIMELINE.frame[0])).toBe("frame");
    expect(weavePhaseAt(WEAVE_TIMELINE.radii[0])).toBe("radii");
    expect(weavePhaseAt(WEAVE_TIMELINE.aux[0])).toBe("scaffold");
    expect(weavePhaseAt(WEAVE_TIMELINE.capture[0])).toBe("capture");
    expect(weavePhaseAt(WEAVE_TIMELINE.settle)).toBe("settled");
  });

  test("the strand-out line leaves the hub and exits the right edge", () => {
    const line = buildStrandOut(web, BOX.width, BOX.height);
    expect(dist(line[0] as WeavePoint, web.hub)).toBeLessThan(1);
    expect((line.at(-1) as WeavePoint).x).toBeGreaterThan(BOX.width);
  });
});

describe("buildWeb — the silk actually connects", () => {
  test.for([BOX, WIDE_SHORT, TALL_NARROW])("every radius ends ON the drawn silk — or crosses the box edge, cropped ($width×$height)", (host) => {
    // The defect: rays were cast at the IDEAL anchor polygon while the frame is drawn SAGGED, so a tip
    // floated up to a sag's worth PAST the silk it should be tied to (worst on the upward radii, which
    // meet the deeply-sagging bridge). Frame anchors sit outside the host box by design, so a radius
    // aimed at one is CUT by the canvas instead — it must cross the edge, not stop shy of it.
    const hostWeb = buildWeb(host);
    const verdicts = hostWeb.radii.map((radius) => {
      const tip = radius.pts.at(-1) as WeavePoint;
      const { verdict, gap, edgeGap } = classifyTip(hostWeb, tip, host);
      return { verdict, tip, gap: gap === null ? null : Number(gap.toFixed(2)), edgeGap: Number(edgeGap.toFixed(2)) };
    });
    expect(verdicts.filter((v) => v.verdict === "dangling")).toEqual([]);
    // …and BOTH legitimate endings actually occur, so neither arm of the rule is vacuous.
    expect({
      onSilk: verdicts.some((v) => v.verdict === "on-silk"),
      cropped: verdicts.some((v) => v.verdict === "cropped"),
    }).toEqual({ onSilk: true, cropped: true });
    // A cropped radius REACHES the edge — a tip parked inside the box reads as broken silk, not as a
    // crop. (The overshoot is a fixed distance along the RAY, so a ray grazing an edge can land a
    // fraction of a pixel inside it; that is under the silk's own width and still reads as cut.)
    expect(verdicts.filter((v) => v.verdict === "cropped" && v.edgeGap > ATTACHED_PX)).toEqual([]);
  });

  test("both spirals stay inside the host box at extreme aspect ratios", () => {
    // Radii cross the edge on purpose (above); the SPIRALS never do, or the canvas chops rings out of
    // the web — the wide-short and tall-narrow hosts are where that showed.
    const escaped = [BOX, WIDE_SHORT, TALL_NARROW].map((box) => {
      const w = buildWeb(box);
      return { box: `${box.width}x${box.height}`, outside: [...w.aux.pts, ...w.capture.pts].filter((p) => !inBox(p, box.width, box.height)).length };
    });
    expect(escaped).toEqual([
      { box: "1280x800", outside: 0 },
      { box: "560x140", outside: 0 },
      { box: "210x380", outside: 0 },
    ]);
  });
});

describe("webGlyph — the condensed mark", () => {
  test("display cut: 8 spokes, an open spiral with a real length, dew off-center", () => {
    expect(WEB_GLYPH_DISPLAY.spokes).toHaveLength(8);
    expect(WEB_GLYPH_DISPLAY.viewBox).toBe(32);
    expect(WEB_GLYPH_DISPLAY.spiralLength).toBeGreaterThan(50);
    expect(WEB_GLYPH_DISPLAY.spiralPath.startsWith("M ")).toBe(true);
    const dewFromHub = Math.hypot(WEB_GLYPH_DISPLAY.dew.x - 16, WEB_GLYPH_DISPLAY.dew.y - 16);
    expect(dewFromHub).toBeGreaterThan(5); // the deliberate asymmetry — never at the hub
  });

  test("compact cut: 6 spokes (the 16px favicon discipline)", () => {
    expect(WEB_GLYPH_COMPACT.spokes).toHaveLength(6);
  });

  test("24-space emission scales everything with the view (the icon-seal arm)", () => {
    const g24 = webGlyph({ spokes: 8, turns: 2.6, spiralEndRadius: 13.5, view: 24 });
    expect(g24.viewBox).toBe(24);
    expect(g24.hub.x).toBe(12);
    // Arc length scales linearly with the view edge.
    expect(g24.spiralLength).toBeCloseTo(WEB_GLYPH_DISPLAY.spiralLength * (24 / 32), 5);
    // Every coordinate stays inside the box.
    for (const s of g24.spokes) {
      for (const v of [s.x1, s.y1, s.x2, s.y2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(24);
      }
    }
  });
});
