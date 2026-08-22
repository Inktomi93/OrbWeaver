// The glint's bearing INDEX (#467) — the skip that makes the idle web cheap must be EXACT, not
// approximate. The index exists because the naive pass tested ~850 segments every frame to find the
// ~85 the sweep can light, and that scan was the measured top self-time of the idle login screen.
//
// The proof that matters is not "the index is smaller" — it is that the index NEVER drops a segment
// the full scan would have lit. So every assertion here compares the two passes' LIT SETS, swept
// right around the turn (including across the 0/TAU seam, where a bearing-sorted index is one missing
// wrap away from a visibly dark arc).

import type { WeavePoint, WeaveStrand, WovenWeb } from "@orb/ui/web-weave";
import { buildWeb } from "@orb/ui/web-weave";
import { describe } from "vitest";
import type { WeaveGlintSegment } from "../../../../packages/ui/src/art/web-weave/web-weave-glint.ts";
import { buildGlintIndex, forEachGlintCandidate, glintSegmentLit, glintSweepAngle } from "../../../../packages/ui/src/art/web-weave/web-weave-glint.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** The login backdrop's own host box + hub (the surface #467 was reported on). */
const HOST = { width: 1440, height: 900, hub: { x: 0.5, y: 0.34 }, seed: 7 } as const;
const TAU = Math.PI * 2;
/** Enough sweep positions to walk the window past every segment, seam included. */
const SWEEP_SAMPLES = 180;
/** One whole glint period (ms) and the step the wall-clock sweep is sampled at. */
const GLINT_PERIOD_MS = 9000;
const GLINT_SAMPLE_STEP_MS = 250;
/** The index must cut the visited set by at least this factor to be worth its existence. */
const MIN_SKIP_FACTOR = 5;

function litKey(strand: WeaveStrand, i: number): string {
  return `${strand.kind}:${strand.t0}:${i}`;
}

/** Every segment the ORIGINAL full pass would light at `sweep` (the same maths, no index). */
function fullScanLit(web: WovenWeb, sweep: number): readonly string[] {
  const lit: string[] = [];
  for (const strand of [web.capture, ...web.radii]) {
    for (let i = 0; i < strand.pts.length - 1; i++) {
      const a = strand.pts[i] as WeavePoint;
      const b = strand.pts[i + 1] as WeavePoint;
      if (glintSegmentLit(a, b, web.hub, sweep) > 0) {
        lit.push(litKey(strand, i));
      }
    }
  }
  return lit.sort((a, b) => a.localeCompare(b));
}

/** …and the same, reached through the index. */
function indexedLit(web: WovenWeb, index: readonly WeaveGlintSegment[], sweep: number): readonly string[] {
  const lit: string[] = [];
  forEachGlintCandidate(index, sweep, (segment) => {
    const a = segment.strand.pts[segment.i] as WeavePoint;
    const b = segment.strand.pts[segment.i + 1] as WeavePoint;
    if (glintSegmentLit(a, b, web.hub, sweep) > 0) {
      lit.push(litKey(segment.strand, segment.i));
    }
  });
  return lit.sort((a, b) => a.localeCompare(b));
}

describe("glint bearing index", () => {
  const web = buildWeb(HOST);
  const index = buildGlintIndex(web);

  test("indexes every lightable segment of the capture spiral and the radii, sorted by bearing", () => {
    const segments = web.capture.pts.length - 1 + web.radii.reduce((sum, r) => sum + r.pts.length - 1, 0);
    expect(index).toHaveLength(segments);
    expect(index.every((s) => s.bearing >= 0 && s.bearing < TAU)).toBe(true);
    expect(index.map((s) => s.bearing)).toEqual([...index].sort((a, b) => a.bearing - b.bearing).map((s) => s.bearing));
  });

  test("lights EXACTLY what the full scan lights, all the way round the sweep (seam included)", () => {
    for (let k = 0; k < SWEEP_SAMPLES; k++) {
      const sweep = (k / SWEEP_SAMPLES) * TAU;
      expect(indexedLit(web, index, sweep), `sweep sample ${k}`).toEqual(fullScanLit(web, sweep));
    }
  });

  test("…and at the wall-clock sweep positions the component actually paints", () => {
    // The seam crossing must hold under the same clock the painters use, not only a hand-built angle.
    for (let ms = 0; ms < GLINT_PERIOD_MS; ms += GLINT_SAMPLE_STEP_MS) {
      const sweep = glintSweepAngle(ms);
      expect(indexedLit(web, index, sweep), `t=${ms}ms`).toEqual(fullScanLit(web, sweep));
    }
  });

  test("visits far fewer segments than the full scan — the whole point of the index", () => {
    let visited = 0;
    forEachGlintCandidate(index, glintSweepAngle(0), () => {
      visited += 1;
    });
    expect(visited).toBeGreaterThan(0);
    expect(visited).toBeLessThan(index.length / MIN_SKIP_FACTOR);
  });
});
