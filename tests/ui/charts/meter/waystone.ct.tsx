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
const STOP_COLOR_RE = /stop-color/u;
const TRANSLATE_RE = /translate/u;

test("the clock reads: 24h dial arcs, the bezel hour scale, and the ember hand swung to the current hour", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 12, minute: 0 }} weather="clear" />);
  await expect(component).toHaveAttribute("data-phase", "afternoon");
  // Six phase arcs tile the ring; exactly ONE is lit — the phase we are in.
  await expect(component.locator("[data-slot=waystone-arc]")).toHaveCount(6);
  await expect(component.locator("[data-slot=waystone-arc][data-lit=true]")).toHaveCount(1);
  await expect(component.locator("[data-slot=waystone-arc][data-lit=true]")).toHaveAttribute("data-arc-phase", "afternoon");
  await expect(component.locator("[data-slot=waystone-ticks] line")).toHaveCount(8);
  // Noon = the top of the dial: the hand's dot sits above the stone's centre and horizontally on it.
  const stone = (await component.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const dot = (await component.locator("[data-slot=waystone-marker-dot]").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  expect(dot.y + dot.height / 2).toBeLessThan(stone.y + stone.height / 4);
  expect(Math.abs(dot.x + dot.width / 2 - (stone.x + stone.width / 2))).toBeLessThan(stone.width / 10);
});

test("midnight swings the hand to the bottom of the same dial and hangs the moon (the angle is the read)", async ({ mount }) => {
  const component = await mount(<Waystone clock={{ hour: 0, minute: 0 }} weather="clear" />);
  await expect(component.locator("[data-slot=waystone-arc][data-lit=true]")).toHaveAttribute("data-arc-phase", "midnight");
  await expect(component.locator("[data-slot=waystone-celestial]")).toHaveAttribute("data-body", "moon");
  const stone = (await component.boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  const dot = (await component.locator("[data-slot=waystone-marker-dot]").boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
  expect(dot.y + dot.height / 2).toBeGreaterThan(stone.y + (stone.height * 3) / 4);
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
  expect(midAngle).not.toBe("135deg");
  const midSky = await skyFrom.evaluate((el) => getComputedStyle(el).stopColor);
  expect(midSky).toBe(dawnSky);
  // …and both land on the new hour once the transit completes (a real interpolation, not a swap).
  await expect.poll(async () => hand.evaluate((el) => getComputedStyle(el).rotate)).toBe("135deg");
  await expect.poll(async () => skyFrom.evaluate((el) => getComputedStyle(el).stopColor)).not.toBe(dawnSky);
  // The new weather layer ENTERS on a fade rather than popping.
  await expect(component.locator("[data-slot=waystone-precip-enter]")).toHaveCSS("animation-name", "orb-ws-enter");
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
  // REMOVE, not shorten — and static-but-still-distinct: the bolt rests DRAWN (a weather signal survives),
  // while the strobe-risk flash rests fully transparent.
  await expect(component.locator("[data-slot=waystone-bolt]")).toHaveCSS("opacity", "1");
  await expect(component.locator("[data-slot=waystone-flash]")).toHaveCSS("opacity", "0");
  await expect(component.locator("[data-slot=waystone-precip] line").first()).toBeAttached();
  await expect(component.locator("[data-slot=waystone-sky]")).toHaveCSS("opacity", "1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
});
