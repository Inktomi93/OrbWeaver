// <Waystone> CT — the rpg band's signature LAYERED time×weather clock (panel-redesign §2; owner RV-10: "it
// does not read as a clock", then "make it the focal element — a comprehensive layered animation system").
// The matrix TABLE is proven exhaustively in the node unit test; what only a browser can prove is here:
//   • the clock STRUCTURE renders — six dial arcs with the current phase lit, the bezel hour scale, and the
//     ember hand rotated to the hour (noon up, midnight down);
//   • the LAYER STACK actually paints per cell, in the right paint order (particles behind the horizon
//     silhouette, fog/wind in front of it);
//   • the layers are really ANIMATING (each on its own keyframe), and each one PAUSES with the document;
//   • a state change TRANSITIONS instead of swapping (the hand's rotate + the sky crossfade are wired);
//   • reduced motion REMOVES every animation while every layer still paints (static but still distinct).
// One mount per test (mount() is once-per-test; a state change uses update()).
import { Waystone } from "@orb/ui/meter";
import { expect, test } from "@playwright/experimental-ct-react";

const ROTATE_RE = /rotate/u;
const OKLCH_RE = /okl(ab|ch)\(\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/u;

interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

/** Chromium resolves relative-color/`color-mix` values to `oklab(L a b)` — parse it so the assertions can be
 *  about PERCEIVED color (is this band actually saturated? are these two actually different?) rather than
 *  about the strings we happened to author. */
function parseOklab(value: string): Lab {
  const m = OKLCH_RE.exec(value);
  if (m === null) {
    throw new Error(`not an ok* color: ${value}`);
  }
  const [l, x, y] = [Number(m[2]), Number(m[3]), Number(m[4])];
  // Chromium keeps relative-color-syntax results in oklch — polar chroma/hue onto the same lab plane the
  // color-mix results land on, so both forms compare apples to apples.
  return m[1] === "ch" ? { l, a: x * Math.cos((y * Math.PI) / 180), b: x * Math.sin((y * Math.PI) / 180) } : { l, a: x, b: y };
}
function chroma(c: Lab): number {
  return Math.hypot(c.a, c.b);
}
function distance(x: Lab | undefined, y: Lab | undefined): number {
  if (x === undefined || y === undefined) {
    throw new Error("missing band color");
  }
  return Math.hypot(x.l - y.l, x.a - y.a, x.b - y.b);
}
const STOP_COLOR_RE = /stop-color/u;
const TRANSLATE_RE = /translate/u;

test("the clock reads: 24h dial arcs, the bezel hour scale, and the ember hand swung to the current hour", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 12, minute: 0 }} weather="clear" />);
  await expect(component).toHaveAttribute("data-phase", "afternoon");
  // Six phase arcs tile the ring; exactly ONE is lit — the phase we are in.
  await expect(component.locator("[data-slot=waystone-arc]")).toHaveCount(6);
  await expect(component.locator("[data-slot=waystone-arc][data-lit=true]")).toHaveCount(1);
  await expect(component.locator("[data-slot=waystone-arc][data-lit=true]")).toHaveAttribute("data-arc-phase", "afternoon");
  // A REAL DIAL: all six bands paint their own identity hue (the owner's "grey + dark blue" read was one lit
  // band on an otherwise neutral ring), and the current one is the brightest — a step within its own hue.
  const strokes = await component.locator("[data-slot=waystone-arc]").evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke));
  expect(new Set(strokes).size).toBe(6);
  // …and DISTINCT AS PIXELS, not merely as strings: the first build kept the right hues but inherited the
  // sky's atmospheric wash, so at 76px all six converged on the same dusty pastel. Every band must carry real
  // chroma, and no two may sit within a perceptual delta of each other.
  const lab = strokes.map(parseOklab);
  for (const [index, color] of lab.entries()) {
    expect(chroma(color), `band ${index} is washed out (chroma ${chroma(color)})`).toBeGreaterThan(0.045);
  }
  for (let i = 0; i < lab.length; i++) {
    for (let j = i + 1; j < lab.length; j++) {
      expect(distance(lab[i], lab[j]), `bands ${i} and ${j} are too close to tell apart`).toBeGreaterThan(0.06);
    }
  }
  const opacities = await component
    .locator("[data-slot=waystone-arc]")
    .evaluateAll((els) => els.map((el) => `${getComputedStyle(el).opacity}:${el.getAttribute("data-lit")}`));
  expect(opacities.filter((o) => o.endsWith(":true"))).toEqual(["1:true"]);
  expect(opacities.filter((o) => o.startsWith("1:") && o.endsWith(":false"))).toEqual([]);
  // Noon = the top of the dial: the hand's dot sits above the stone's centre and horizontally on it.
  const stone = (await component.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const pointer = (await component.locator("[data-slot=waystone-marker-pointer]").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  expect(pointer.y + pointer.height / 2).toBeLessThan(stone.y + stone.height / 4);
  expect(Math.abs(pointer.x + pointer.width / 2 - (stone.x + stone.width / 2))).toBeLessThan(stone.width / 10);
});

test("midnight swings the hand to the bottom of the same dial and hangs the moon (the angle is the read)", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 0, minute: 0 }} weather="clear" />);
  await expect(component.locator("[data-slot=waystone-arc][data-lit=true]")).toHaveAttribute("data-arc-phase", "midnight");
  await expect(component.locator("[data-slot=waystone-celestial]")).toHaveAttribute("data-body", "moon");
  const stone = (await component.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const pointer = (await component.locator("[data-slot=waystone-marker-pointer]").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  expect(pointer.y + pointer.height / 2).toBeGreaterThan(stone.y + (stone.height * 3) / 4);
});

test("night + storm paints the WHOLE stack: sky · stars · moon · dark deck · rain · wash · flash · bolt · horizon", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 21, minute: 30 }} weather="storm" />);
  await expect(component).toHaveAttribute("data-weather", "storm");
  // ONE sky gradient, painted from the hour's interpolated stops (the continuous time axis).
  await expect(component.locator("[data-slot=waystone-sky]")).toHaveCount(1);
  await expect(component.locator("[data-slot=waystone-sky]")).toHaveCSS("opacity", "1");
  await expect(component.locator("[data-slot=waystone-stars] circle")).toHaveCount(10);
  await expect(component.locator("[data-slot=waystone-celestial]")).toHaveAttribute("data-body", "moon");
  await expect(component.locator("[data-slot=waystone-clouds]")).toHaveAttribute("data-cloud-tone", "dark");
  await expect(component.locator("[data-slot=waystone-precip]")).toHaveAttribute("data-particles", "rain");
  await expect(component.locator("[data-slot=waystone-wash]")).toBeAttached();
  await expect(component.locator("[data-slot=waystone-flash]")).toBeAttached();
  await expect(component.locator("[data-slot=waystone-bolt]")).toBeAttached();
  await expect(component.locator("[data-slot=waystone-horizon]")).toBeAttached();
});

test("dawn + snow is a different stack: sun over a light deck, motes not streaks, no lightning", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 6, minute: 0 }} weather="snow" />);
  await expect(component).toHaveAttribute("data-phase", "dawn");
  await expect(component).toHaveAttribute("data-weather", "snow");
  await expect(component.locator("[data-slot=waystone-celestial]")).toHaveAttribute("data-body", "sun");
  await expect(component.locator("[data-slot=waystone-clouds]")).toHaveAttribute("data-cloud-tone", "light");
  await expect(component.locator("[data-slot=waystone-precip]")).toHaveAttribute("data-particles", "snow");
  await expect(component.locator("[data-slot=waystone-precip] circle").first()).toBeAttached();
  await expect(component.locator("[data-slot=waystone-bolt]")).toHaveCount(0);
});

test("paint order: precipitation falls BEHIND the horizon silhouette, fog drifts IN FRONT of it", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 18, minute: 0 }} weather="fog" />);
  await expect(component.locator("[data-slot=waystone-fog]")).toBeAttached();
  // The band layer is the LAST child of the clipped sky group — painted over the silhouette.
  const lastSlot = await component.locator("g[clip-path] > *").last().getAttribute("data-slot");
  expect(lastSlot).toBe("waystone-bands-enter");
  await expect(component.locator("[data-slot=waystone-bands-enter] [data-slot=waystone-fog]")).toBeAttached();
  // A VEIL, not a skeleton loader: soft wide ellipses, never rounded bars.
  await expect(component.locator("[data-slot=waystone-fog] ellipse")).toHaveCount(2);
  await expect(component.locator("[data-slot=waystone-fog] line")).toHaveCount(0);
});

test("every layer runs its OWN animation, and the stars twinkle out of sync with each other", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 21, minute: 0 }} weather="rain" />);
  await expect(component.locator("[data-slot=waystone-precip]")).toHaveCSS("animation-name", "orb-ws-fall");
  await expect(component.locator("[data-slot=waystone-precip]")).toHaveCSS("animation-iteration-count", "infinite");
  await expect(component.locator("[data-slot=waystone-clouds]")).toHaveCSS("animation-name", "orb-ws-sway");
  await expect(component.locator("[data-slot=waystone-celestial] .orb-ws-glow")).toHaveCSS("animation-name", "orb-ws-glow");
  await expect(component.locator("[data-slot=waystone-marker] .orb-ws-marker")).toHaveCSS("animation-name", "orb-ws-marker");
  // Staggered, never synchronised: neighbouring stars differ in delay AND period.
  const stars = component.locator("[data-slot=waystone-stars] circle");
  const first = await stars.nth(0).evaluate((el) => getComputedStyle(el).animationDelay);
  const second = await stars.nth(1).evaluate((el) => getComputedStyle(el).animationDelay);
  const secondDuration = await stars.nth(1).evaluate((el) => getComputedStyle(el).animationDuration);
  const firstDuration = await stars.nth(0).evaluate((el) => getComputedStyle(el).animationDuration);
  expect(first).not.toBe(second);
  expect(firstDuration).not.toBe(secondDuration);
  // …and the whole stone pauses with the document rather than compositing for nobody.
  await expect(component).toHaveAttribute("data-paused", "false");
});

test("a state change TRANSITIONS: the hand swings, the sky MELTS between hours, the weather fades in (never a swap)", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 6, minute: 0 }} weather="clear" />);
  const hand = component.locator("[data-slot=waystone-marker]");
  const skyFrom = component.locator("[data-slot=waystone-sky-from]");
  const sun = component.locator("[data-slot=waystone-celestial]");
  // The hand rotates around the dial (a translate would cut a chord across the face); the sky's stop COLORS
  // transition (the continuous axis' crossfade); the celestial body slides.
  await expect(hand).toHaveCSS("transition-property", ROTATE_RE);
  await expect(skyFrom).toHaveCSS("transition-property", STOP_COLOR_RE);
  await expect(sun).toHaveCSS("transition-property", TRANSLATE_RE);
  // The gate bans a one-shot live read INSIDE expect(); hoist each sample to a const first (these are
  // deliberate point-in-time samples of a transition, so a retrying assertion would defeat the test).
  const dawnAngle = await hand.evaluate((el) => getComputedStyle(el).rotate);
  expect(dawnAngle).toBe("270deg"); // 06:00 — a quarter of the dial anticlockwise from noon
  const dawnSky = await skyFrom.evaluate((el) => getComputedStyle(el).stopColor);

  await component.update(<Waystone clock={{ hour: 21, minute: 0 }} weather="rain" />);
  await expect(component).toHaveAttribute("data-phase", "night");
  // NEVER A HARD SWAP: neither the hand nor the sky has arrived the frame after the change…
  const midAngle = await hand.evaluate((el) => getComputedStyle(el).rotate);
  const midSky = await skyFrom.evaluate((el) => getComputedStyle(el).stopColor);
  expect(midAngle).not.toBe("135deg");
  // …and both land on the new hour once the transit completes (a real interpolation, not a swap).
  await expect.poll(async () => hand.evaluate((el) => getComputedStyle(el).rotate)).toBe("135deg");
  await expect.poll(async () => skyFrom.evaluate((el) => getComputedStyle(el).stopColor)).not.toBe(dawnSky);
  // The mid-flight sky sample was neither the old sky nor the settled one — it was caught IN the melt.
  const settledSky = await skyFrom.evaluate((el) => getComputedStyle(el).stopColor);
  expect(midSky).not.toBe(settledSky);
  // The new weather layer ENTERS on a fade rather than popping.
  await expect(component.locator("[data-slot=waystone-precip-enter]")).toHaveCSS("animation-name", "orb-ws-enter");
});

test("the 24h convention is TAUGHT: a sun glyph at the top cardinal, a crescent at the bottom", async ({ mount }) => {
  // The owner had to read the ring band-by-band to decode it ("maybe I\u0027m reading it wrong"). A noon-top
  // 24h dial is unlearnable cold, so the ring explains itself: sun overhead, moon at the bottom.
  const component = await mount(<Waystone clock={{ hour: 9, minute: 0 }} weather="clear" />);
  const stone = (await component.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const sun = (await component.locator("[data-slot=waystone-cardinal-noon] circle").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const moon = (await component.locator("[data-slot=waystone-cardinal-midnight]").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  expect(sun.y + sun.height / 2).toBeLessThan(stone.y + stone.height / 3);
  expect(moon.y + moon.height / 2).toBeGreaterThan(stone.y + (stone.height * 2) / 3);
  // Both sit on the vertical axis — they ARE the cardinals.
  expect(Math.abs(sun.x + sun.width / 2 - (stone.x + stone.width / 2))).toBeLessThan(stone.width / 12);
  expect(Math.abs(moon.x + moon.width / 2 - (stone.x + stone.width / 2))).toBeLessThan(stone.width / 12);
});

test("the hand takes the SHORT way round: 11:00 → 13:00 sweeps forward two hours, not backwards round the dial", async ({ mount }) => {
  // The dial\u0027s angle wraps at NOON (its origin), so 11:00 is 345° and 13:00 is 15°: modulo values told CSS
  // to interpolate 345 → 15, and the hand visibly ran backwards across the whole face on the most ordinary
  // state change there is. The accumulated angle keeps going clockwise instead.
  const component = await mount(<Waystone clock={{ hour: 11, minute: 0 }} weather="clear" />);
  const hand = component.locator("[data-slot=waystone-marker]");
  const before = await hand.evaluate((el) => Number.parseFloat(getComputedStyle(el).rotate));
  expect(before).toBeCloseTo(345, 0);
  await component.update(<Waystone clock={{ hour: 13, minute: 0 }} weather="clear" />);
  // 375°, not 15° — the same place on the dial, reached the short way.
  await expect.poll(async () => hand.evaluate((el) => Math.round(Number.parseFloat(getComputedStyle(el).rotate)))).toBe(375);
});

test("the celestial body REMOUNTS at the sun/moon handover instead of sliding backwards across the sky", async ({ mount }) => {
  // 18:00 → 20:00 hands the sky from the setting sun to the rising moon: the arc restarts, so a shared node
  // would transition the sun\u0027s last position into the moon\u0027s first — an object moving the wrong way.
  const component = await mount(<Waystone clock={{ hour: 18, minute: 0 }} weather="clear" />);
  const body = component.locator("[data-slot=waystone-celestial]");
  await expect(body).toHaveAttribute("data-body", "sun");
  await component.update(<Waystone clock={{ hour: 20, minute: 0 }} weather="clear" />);
  await expect(body).toHaveAttribute("data-body", "moon");
  // A remount replays the enter fade — the tell that this is a NEW node, not the sun sliding home.
  await expect(body).toHaveCSS("animation-name", "orb-ws-enter");
});

test("the homestead is SEATED in the ridge with a window that lights up at night", async ({ mount }) => {
  const day = await mount(<Waystone clock={{ hour: 12, minute: 0 }} weather="clear" />);
  const gable = (await day.locator("[data-slot=waystone-gable]").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0, bottom: 0 };
  const horizon = (await day.locator("[data-slot=waystone-horizon]").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  // Its base is BELOW the silhouette's crest at that x — walls in the hill, never a house floating over it.
  expect(gable.y + gable.height).toBeGreaterThan(horizon.y);
  const dayLit = await day.locator("[data-slot=waystone-gable-window]").evaluate((el) => Number(getComputedStyle(el).opacity));
  await day.update(<Waystone clock={{ hour: 0, minute: 0 }} weather="clear" />);
  await expect
    .poll(async () => day.locator("[data-slot=waystone-gable-window]").evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeGreaterThan(dayLit);
});

test("an unset clock is the honest empty stone: no hand, no arcs, no weather, a plain dim sky", async ({ mount }) => {
  const component = await mount(<Waystone clock={null} weather="rain" />);
  await expect(component).toHaveAttribute("data-phase", "unset");
  await expect(component.locator("[data-slot=waystone-sky-unset]")).toHaveCSS("opacity", "0.5");
  await expect(component.locator("[data-slot=waystone-marker]")).toHaveCount(0);
  await expect(component.locator("[data-slot=waystone-arc]")).toHaveCount(0);
  await expect(component.locator("[data-slot=waystone-precip]")).toHaveCount(0);
  await expect(component.locator("[data-slot=waystone-clouds]")).toHaveCount(0);
});

test("the whole composite is aria-hidden decoration and carries ZERO text (the band's lines are the datum)", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 9, minute: 0 }} weather="cloudy" />);
  await expect(component).toHaveAttribute("aria-hidden", "true");
  await expect(component.locator("text")).toHaveCount(0);
  await expect(component.locator("[data-slot=waystone-clouds]")).toHaveAttribute("data-cloud-count", "4");
});

// `test.use({ reducedMotion })` does NOT reach a CT page (the harness page is a worker-scoped fixture built
// before per-test context options apply — verified: matchMedia stays false). `page.emulateMedia` DOES, and it
// re-resolves the already-mounted stone's CSS live, which is the stronger assertion anyway. Reset after, since
// the page outlives the test.
test("reduced motion REMOVES every layer's animation (guide §3.9) — the frozen stone still paints them all", async ({ mount, page }) => {
  const component = await mount(<Waystone clock={{ hour: 14, minute: 0 }} weather="storm" />);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(component.locator("[data-slot=waystone-precip]")).toHaveCSS("animation-name", "none");
  await expect(component.locator("[data-slot=waystone-clouds]")).toHaveCSS("animation-name", "none");
  await expect(component.locator("[data-slot=waystone-flash]")).toHaveCSS("animation-name", "none");
  await expect(component.locator("[data-slot=waystone-stars] circle").first()).toHaveCSS("animation-name", "none");
  // REMOVE, not shorten — and static-but-still-distinct: with the animation gone the bolt is DRAWN (the
  // storm keeps its signature), while the strobe-risk sky flash rests fully transparent.
  await expect(component.locator("[data-slot=waystone-bolt]")).toHaveCSS("opacity", "0.9");
  await expect(component.locator("[data-slot=waystone-flash]")).toHaveCSS("opacity", "0");
  await expect(component.locator("[data-slot=waystone-precip] line").first()).toBeAttached();
  await expect(component.locator("[data-slot=waystone-sky]")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
});
