// The web-weave geometry (docs/design/login-loading-screen.md §1/§9.8) — the pure half's contract:
//   • DETERMINISM — the same seed weaves byte-identical geometry (the CT-assertable-web promise);
//     a different seed genuinely varies it (the jitter is live, not decorative).
//   • CHOREOGRAPHY — the real orb-weaver build order holds as data: bridge → drop → frame → radii →
//     aux scaffold → capture, each phase window monotonic, the caption axis matching it.
//   • WEB SHAPE — 16 radii; the capture spiral is laid RIM-INWARD and STOPS SHORT of the hub (the
//     free zone — the one biological invariant the design calls out); dew condenses ON the spiral.
//   • THE GLYPH — the condensed mark: spokes/turns per cut, an OPEN spiral with a real arc length
//     (WebSpinner's dash period), the dew at its named fraction, 24-space emission for the icon seal.

import type { WeavePoint } from "@orb/ui/web-weave";
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

const dist = (a: WeavePoint, b: WeavePoint): number => Math.hypot(a.x - b.x, a.y - b.y);

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
