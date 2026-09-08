// The per-frame painters (docs/history/design/web-weave-motion-fixes.md §4) — the owner's "glitchy highlights",
// stated as two invariants a recorded frame must hold:
//   • ONE ALPHA PER STROKED PATH — canvas applies `globalAlpha` at stroke() time, so accumulating a
//     multi-segment path while mutating the alpha per segment paints the WHOLE run at the last
//     segment's value (the glint popped as its window swept);
//   • EVERYTHING RIDES THE SAME SWAY — the strands are drawn through a per-point sway field, so any
//     layer painted at REST coordinates (dew, glint, the spider) floats off the silk it belongs to.
// The instrument is a recording 2D context: no jsdom, no canvas binding — the painters only ever call
// context methods, so recording them is a complete observation of the frame.

import type { WeavePoint, WovenWeb } from "@orb/ui/web-weave";
import { buildWeb, WEAVE_TIMELINE } from "@orb/ui/web-weave";
import { describe } from "vitest";
import { WEAVE_CHARACTER_PRESETS } from "../../../../packages/ui/src/art/web-weave/web-weave-character.ts";
import { buildGlintIndex, glintSegmentLit, glintSweepAngle } from "../../../../packages/ui/src/art/web-weave/web-weave-glint.ts";
import type { WeavePalette } from "../../../../packages/ui/src/art/web-weave/web-weave-render.ts";
import { renderWeaveFrame } from "../../../../packages/ui/src/art/web-weave/web-weave-render.ts";
import type { WeavePluckMap } from "../../../../packages/ui/src/art/web-weave/web-weave-sway.ts";
import { swayPt, weaveSwayOffset } from "../../../../packages/ui/src/art/web-weave/web-weave-sway.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** One browser frame — the delta the prey machine would integrate over. */
const FRAME_MS = 16;

const BOX = { width: 1280, height: 800, hub: { x: 0.5, y: 0.42 }, seed: 7 } as const;
/** A settled instant with a wall clock well off zero, so the sway field is genuinely non-zero. */
const NOW_MS = 12_345.6;
/** Coincidence tolerance: dew is BUILT from capture-spiral samples, so after the fix the drawn drop and
 *  the drawn strand point are the same number — a hair of float slack, not a pixel of drift. */
const COINCIDENT_PX = 0.01;

/** A stroked path: its points and how many times the alpha was re-set while it accumulated. */
interface RecordedStroke {
  readonly points: readonly WeavePoint[];
  readonly alphaSets: number;
}
interface RecordedArc {
  readonly x: number;
  readonly y: number;
  /** Canvas transform nesting — the spider paints inside save()/restore(); the dew paints at depth 0. */
  readonly depth: number;
}

class RecordingContext {
  readonly strokes: RecordedStroke[] = [];
  readonly arcs: RecordedArc[] = [];
  lineCap = "butt";
  strokeStyle = "";
  fillStyle = "";
  lineWidth = 1;
  shadowColor = "";
  shadowBlur = 0;
  private alpha = 1;
  private alphaSets = 0;
  private path: WeavePoint[] = [];
  private depth = 0;

  get globalAlpha(): number {
    return this.alpha;
  }
  set globalAlpha(value: number) {
    this.alpha = value;
    this.alphaSets += 1;
  }
  beginPath(): void {
    this.path = [];
    this.alphaSets = 0;
  }
  moveTo(x: number, y: number): void {
    this.path.push({ x, y });
  }
  lineTo(x: number, y: number): void {
    this.path.push({ x, y });
  }
  stroke(): void {
    this.strokes.push({ points: [...this.path], alphaSets: this.alphaSets });
  }
  arc(x: number, y: number): void {
    this.arcs.push({ x, y, depth: this.depth });
  }
  ellipse(): void {
    // recorded via arc()/stroke() only — the spider's abdomen carries no assertion
  }
  fill(): void {
    // fills are located by their preceding arc()
  }
  save(): void {
    this.depth += 1;
  }
  restore(): void {
    this.depth -= 1;
  }
  translate(): void {
    // body-local transform; the spider's own coordinates are not asserted here
  }
  rotate(): void {
    // body-local transform
  }
  scale(): void {
    // body-local transform
  }
}

const PALETTE: WeavePalette = {
  silk: "rgb(1, 1, 1)",
  silkBright: "rgb(2, 2, 2)",
  glow: "rgb(3, 3, 3)",
  dew: "rgb(4, 4, 4)",
  spiderBody: "rgb(5, 5, 5)",
  spiderBand: "rgb(6, 6, 6)",
};

const CALM = { wind: 0, shiver: 0 } as const;

/** Record one settled, animated frame (sway live, glint sweeping, dew condensed). */
function recordSettledFrame(over?: { plucks?: WeavePluckMap; wind?: number; web?: WovenWeb }): RecordingContext {
  const recorder = new RecordingContext();
  const web = over?.web ?? buildWeb(BOX);
  renderWeaveFrame(
    // The recorder IS the instrument: a canvas context has no typed factory, the painters only ever CALL
    // methods on it, and every method they use is implemented above (a new one throws, loudly).
    // FABRICATION-OK: recording 2D context — no factory exists for CanvasRenderingContext2D.
    recorder as unknown as Parameters<typeof renderWeaveFrame>[0],
    {
      web,
      state: "settled",
      t: WEAVE_TIMELINE.rest,
      now: NOW_MS,
      palette: PALETTE,
      dim: 1,
      still: false,
      spider: true,
      strandOut: null,
      weather: { ...CALM, wind: over?.wind ?? 0 },
      plucks: over?.plucks ?? null,
      dt: FRAME_MS,
      character: WEAVE_CHARACTER_PRESETS.calm,
      prey: null,
      // The glint's bearing index — the real one, so these recordings keep exercising the path the
      // component actually paints (this frame's sway is a per-point FIELD, so the painter takes the
      // full scan; the index's own exactness is pinned in web-weave-glint.test.ts).
      glint: buildGlintIndex(web),
    },
    { prev: null },
  );
  return recorder;
}

describe("swayPt — the one sway field", () => {
  const p: WeavePoint = { x: 300, y: 200 };

  test("rigid mode returns the point untouched", () => {
    expect(swayPt(p, null)).toEqual(p);
  });

  test("the field displaces by a bounded, position-dependent amount", () => {
    const swayed = swayPt(p, { kind: "field", now: NOW_MS, ...CALM });
    expect(Math.hypot(swayed.x - p.x, swayed.y - p.y)).toBeGreaterThan(0);
    // The field's amplitude is the ambient breath, not a lurch: a couple of px on each axis.
    expect(Math.abs(swayed.x - p.x)).toBeLessThanOrEqual(2.1);
    expect(Math.abs(swayed.y - p.y)).toBeLessThanOrEqual(1.5);
    // Position-dependent: a neighbour on a different row/column moves differently.
    expect(swayPt({ x: p.x + 90, y: p.y + 90 }, { kind: "field", now: NOW_MS, ...CALM })).not.toEqual({ x: swayed.x + 90, y: swayed.y + 90 });
  });

  test("offset mode IS the translate the cached blit is drawn with", () => {
    // The resting path blits a rigid buffer at weaveSwayOffset and paints the live layers over it — if
    // these two disagreed by even a pixel, every highlight and dew drop would slide across the silk.
    const { dx, dy } = weaveSwayOffset({ kind: "offset", now: NOW_MS, ...CALM });
    expect(swayPt(p, { kind: "offset", now: NOW_MS, ...CALM })).toEqual({ x: p.x + dx, y: p.y + dy });
    // …and it stays true with the weather up, or a windy resting web would slide under its own dew.
    const windy = { kind: "offset", now: NOW_MS, wind: 0.7, shiver: 0.4 } as const;
    const blown = weaveSwayOffset(windy);
    expect(swayPt(p, windy)).toEqual({ x: p.x + blown.dx, y: p.y + blown.dy });
  });
});

describe("glintSegmentLit — the per-segment highlight", () => {
  const hub: WeavePoint = { x: 0, y: 0 };
  /** A segment straddling a bearing, at unit distance from the hub. */
  const segmentAt = (bearing: number): readonly [WeavePoint, WeavePoint] => [
    { x: Math.cos(bearing) * 99, y: Math.sin(bearing) * 99 },
    { x: Math.cos(bearing) * 101, y: Math.sin(bearing) * 101 },
  ];

  test("full at the sweep center, fading to nothing at the window edge", () => {
    const sweep = 1;
    const [a, b] = segmentAt(sweep);
    expect(glintSegmentLit(a, b, hub, sweep)).toBeCloseTo(1, 6);
    const near = segmentAt(sweep + 0.1);
    const far = segmentAt(sweep + 0.2);
    const litNear = glintSegmentLit(near[0], near[1], hub, sweep);
    const litFar = glintSegmentLit(far[0], far[1], hub, sweep);
    expect(litNear).toBeGreaterThan(litFar);
    expect(litFar).toBeGreaterThan(0);
  });

  test("outside the window it is exactly zero (the segment is skipped, not stroked faintly)", () => {
    const sweep = 1;
    const out = segmentAt(sweep + 0.31);
    expect(glintSegmentLit(out[0], out[1], hub, sweep)).toBe(0);
    // …and the wrap-around is the SHORT way: a segment just below the sweep is as lit as one above.
    const below = segmentAt(sweep - 0.1);
    const above = segmentAt(sweep + 0.1);
    expect(glintSegmentLit(below[0], below[1], hub, sweep)).toBeCloseTo(glintSegmentLit(above[0], above[1], hub, sweep), 6);
    // The window sweeps a full turn per period and wraps cleanly through 0.
    const wrapped = segmentAt(0.05);
    expect(glintSegmentLit(wrapped[0], wrapped[1], hub, glintSweepAngle(0))).toBeGreaterThan(0);
  });
});

describe("renderWeaveFrame — the settled frame", () => {
  const frame = recordSettledFrame();

  test("no stroked path mixes alphas — a multi-segment path is stroked with one value", () => {
    // A path accumulated across several segments while the alpha is re-set per segment paints them ALL
    // at the last value: the pop the owner saw. Either the path is a single segment, or its alpha was
    // fixed before the path opened.
    const mixed = frame.strokes.filter((s) => s.alphaSets > 1 && s.points.length > 2).map((s) => ({ segments: s.points.length - 1, alphaSets: s.alphaSets }));
    expect(mixed).toEqual([]);
  });

  test("every dew drop is painted ON the drawn silk, not at its rest position", () => {
    // The capture spiral is the longest stroked path in the frame; dew is built FROM its samples, so
    // each drop center must coincide with a drawn vertex of that very path.
    let capture = frame.strokes[0] as RecordedStroke;
    for (const stroke of frame.strokes) {
      if (stroke.points.length > capture.points.length) {
        capture = stroke;
      }
    }
    const drops = frame.arcs.filter((a) => a.depth === 0);
    expect(drops.length).toBeGreaterThan(3);
    const drift = drops.map((drop) => Math.min(...capture.points.map((p) => Math.hypot(p.x - drop.x, p.y - drop.y))));
    expect(Math.max(...drift)).toBeLessThan(COINCIDENT_PX);
  });
});

describe("renderWeaveFrame — the silk under a pluck", () => {
  test("a plucked strand is drawn DISPLACED, and its dew rides with it", () => {
    const web = buildWeb(BOX);
    // Strike the capture spiral mid-run, a beat before the recorded instant, so the ring is live.
    const plucks: WeavePluckMap = new Map([[web.capture, [{ s0: 0.5, t0: NOW_MS - 60, amp: 8 }]]]);
    const quiet = recordSettledFrame({ web });
    const rung = recordSettledFrame({ web, plucks });
    const longest = (frame: RecordingContext): RecordedStroke => {
      let best = frame.strokes[0] as RecordedStroke;
      for (const stroke of frame.strokes) {
        if (stroke.points.length > best.points.length) {
          best = stroke;
        }
      }
      return best;
    };
    const before = longest(quiet).points;
    const after = longest(rung).points;
    expect(after).toHaveLength(before.length);
    const moved = before.map((p, i) => Math.hypot(p.x - (after[i] as WeavePoint).x, p.y - (after[i] as WeavePoint).y));
    // The ring is local: the struck neighbourhood moves, the far end of the spiral does not.
    expect(Math.max(...moved)).toBeGreaterThan(1);
    expect(Math.min(...moved)).toBeLessThan(0.01);
    // …and the dew still sits exactly on the silk it hangs from — the whole point of the drop's index.
    const drops = rung.arcs.filter((a) => a.depth === 0);
    const drift = drops.map((drop) => Math.min(...after.map((p) => Math.hypot(p.x - drop.x, p.y - drop.y))));
    expect(Math.max(...drift)).toBeLessThan(COINCIDENT_PX);
  });

  test("an untouched web is drawn IDENTICALLY with the physics module wired in (inert by default)", () => {
    // The regression guard for every host that never opts in: no wind, no plucks → the same numbers.
    const a = recordSettledFrame();
    const b = recordSettledFrame({ plucks: new Map() });
    expect(JSON.stringify(b.strokes)).toBe(JSON.stringify(a.strokes));
    expect(JSON.stringify(b.arcs)).toBe(JSON.stringify(a.arcs));
  });

  test("wind widens the sway — the same strand is drawn further from its rest position", () => {
    const rest = recordSettledFrame().strokes[0] as RecordedStroke;
    const blown = recordSettledFrame({ wind: 1 }).strokes[0] as RecordedStroke;
    const spread = rest.points.map((p, i) => Math.hypot(p.x - (blown.points[i] as WeavePoint).x, p.y - (blown.points[i] as WeavePoint).y));
    expect(Math.max(...spread)).toBeGreaterThan(1);
  });
});
