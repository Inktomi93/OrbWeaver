import { expect, test } from "@orb/testkit/node";
import type { BuildWebInput, WeavePoint } from "@orb/ui/web-weave";
import { buildStrandOut, buildWeb, WEAVE_TIMELINE, weaveJitter, weavePhaseAt, webGlyph, wrapToPi } from "@orb/ui/web-weave";

const HOSTS = [
  { width: 1280, height: 800, hub: { x: 0.5, y: 0.42 }, seed: 7 },
  { width: 560, height: 140, hub: { x: 0.5, y: 0.42 }, seed: 7 },
  { width: 210, height: 380, hub: { x: 0.5, y: 0.34 }, seed: 7 },
] as const satisfies readonly BuildWebInput[];
const TAU = Math.PI * 2;
const distance = (a: WeavePoint, b: WeavePoint): number => Math.hypot(a.x - b.x, a.y - b.y);

test("a seed reproduces the whole web while different seeds vary its strands and bounded noise", () => {
  const host = HOSTS[0];
  const first = buildWeb(host);
  expect(buildWeb(host)).toEqual(first);
  expect(buildWeb({ ...host, seed: host.seed + 1 }).radii).not.toEqual(first.radii);
  const samples = Array.from({ length: 64 }, (_, index) => weaveJitter(index, 3, host.seed));
  expect(samples).toEqual(samples.map((_, index) => weaveJitter(index, 3, host.seed)));
  expect(samples).not.toEqual(samples.map((_, index) => weaveJitter(index, 3, host.seed + 1)));
  expect(new Set(samples).size).toBeGreaterThan(1);
  for (const sample of samples) {
    expect(sample).toBeGreaterThanOrEqual(0);
    expect(sample).toBeLessThan(1);
  }
});

test.for(HOSTS)("the $width by $height web keeps capture silk inside its host and dew on that silk", (host) => {
  const web = buildWeb(host);
  expect(web.hub).toEqual({ x: host.width * host.hub.x, y: host.height * host.hub.y });
  expect(web.radii).toHaveLength(16);
  for (const radius of web.radii) {
    expect(radius.pts[0]).toEqual(web.hub);
  }
  const first = web.capture.pts[0];
  const last = web.capture.pts.at(-1);
  if (first === undefined || last === undefined) {
    throw new Error("The web has no capture spiral");
  }
  expect(distance(first, web.hub)).toBeGreaterThan(distance(last, web.hub));
  expect(distance(last, web.hub)).toBeGreaterThanOrEqual(web.freeZoneRadius);
  for (const point of [...web.aux.pts, ...web.capture.pts]) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(host.width);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(host.height);
  }
  expect(web.dew.length).toBeGreaterThan(3);
  for (const drop of web.dew) {
    expect(web.capture.pts[drop.index]).toEqual({ x: drop.x, y: drop.y });
  }
  const exit = buildStrandOut(web, host.width, host.height);
  expect(exit[0]).toEqual(web.hub);
  const end = exit.at(-1);
  if (end === undefined) {
    throw new Error("The handoff has no exit strand");
  }
  expect(end.x).toBeGreaterThan(host.width);
  expect(end.y).toBeLessThan(web.hub.y);
});

test("the caption and itinerary follow the build phases without unwalked frame edges or time gaps", () => {
  const timeline = WEAVE_TIMELINE;
  const phases = [
    [timeline.bridge[0], "bridge"],
    [timeline.drop[0], "anchor"],
    [timeline.frame[0], "frame"],
    [timeline.radii[0], "radii"],
    [timeline.aux[0], "scaffold"],
    [timeline.capture[0], "capture"],
    [timeline.settle, "settled"],
  ] as const;
  for (const [start, phase] of phases) {
    expect(weavePhaseAt(start)).toBe(phase);
  }
  for (const [index, [start]] of phases.slice(1).entries()) {
    expect(weavePhaseAt(start - 1)).toBe(phases[index]?.[1]);
  }
  const web = buildWeb(HOSTS[0]);
  expect(web.itinerary.length).toBeGreaterThan(web.radii.length);
  for (const leg of web.itinerary) {
    expect(leg.t1).toBeGreaterThan(leg.t0);
  }
  expect(web.itinerary.slice(1).map((leg) => leg.t0)).toEqual(web.itinerary.slice(0, -1).map((leg) => leg.t1));
  expect(web.itinerary.at(-1)?.t1).toBe(timeline.rest);
  const frameEdges = web.strands.filter((strand) => strand.kind === "frame" && strand.t0 >= timeline.frame[0]);
  expect(frameEdges).toHaveLength(4);
  for (const edge of frameEdges) {
    expect(web.itinerary.some((leg) => leg.pts === edge.pts && leg.t0 === edge.t0 && leg.t1 === edge.t1 && leg.from === 0 && leg.to === 1)).toBe(true);
  }
});

test("the same glyph scales its arc length and coordinates to the icon grid without closing its spiral", () => {
  const input = { spokes: 8, turns: 2.6, spiralEndRadius: 13.5 };
  const display = webGlyph({ ...input, view: 32 });
  const icon = webGlyph({ ...input, view: 24 });
  const scale = icon.viewBox / display.viewBox;
  expect(display.spokes).toHaveLength(input.spokes);
  expect(icon.spokes).toHaveLength(input.spokes);
  expect(display.spiralLength).toBeGreaterThan(50);
  expect(icon.spiralLength).toBeCloseTo(display.spiralLength * scale, 6);
  expect(icon.spiralPath).toMatch(/^M /u);
  expect(icon.spiralPath).not.toMatch(/[zZ]/u);
  expect(distance(display.dew, display.hub)).toBeGreaterThan(display.hub.r);
  expect(icon.hub).toEqual({ x: display.hub.x * scale, y: display.hub.y * scale, r: display.hub.r * scale });
  for (const [index, spoke] of icon.spokes.entries()) {
    const original = display.spokes[index];
    if (original === undefined) {
      throw new Error("The icon grid changed the glyph topology");
    }
    for (const coordinate of ["x1", "y1", "x2", "y2"] as const) {
      expect(spoke[coordinate]).toBeCloseTo(original[coordinate] * scale, 6);
      expect(spoke[coordinate]).toBeGreaterThanOrEqual(0);
      expect(spoke[coordinate]).toBeLessThanOrEqual(icon.viewBox);
    }
  }
});

test("heading changes cross the angle seam by the short route regardless of full turns", () => {
  const beforeSeam = Math.PI - 0.1;
  const afterSeam = -Math.PI + 0.1;
  for (const turns of [-100, -1, 0, 1, 100]) {
    expect(wrapToPi(afterSeam - beforeSeam + turns * TAU)).toBeCloseTo(0.2, 10);
    expect(wrapToPi(beforeSeam - afterSeam + turns * TAU)).toBeCloseTo(-0.2, 10);
    expect(wrapToPi(turns * TAU)).toBeCloseTo(0, 10);
  }
});
