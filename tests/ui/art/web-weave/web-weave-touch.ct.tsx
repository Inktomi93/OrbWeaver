// <WebWeave> under a COARSE pointer — the touch half of the pointer seam (#152).
//
// The mouse path is proven in web-weave.ct.tsx ("dragging across the silk RINGS it"); a mouse drag
// says NOTHING about a thumb: touch has no hover, its moves are delivered only while the finger is
// down, and the browser CANCELS the pointer stream the instant it decides the gesture is a scroll.
// So this suite drives chromium's real touch pipeline (tests/support/browser/weave-drive.ts) and asserts
// the same rendered affordance the mouse test does — the painted frame moves beyond its own motion.
//
// Four claims that only hold TOGETHER:
//   • a thumb drag rings the silk (the affordance);
//   • a thumb over a NON-interactive weave changes nothing (the instrument control — without it a
//     "rang" verdict could be the web's own beat, which is neither small nor steady: back-to-back
//     idle samples on one mount ranged 16k–136k, so the baseline is `ambientCeiling`, a max over
//     repeated short and long spans, never a single two-frame reading);
//   • reduced motion REMOVES the pluck, it does not damp it (§3.9): the one static frame is
//     byte-identical after a finger crosses it, and no extra frame is painted;
//   • a vertical thumb drag over a weave behind scrollable content still SCROLLS it (the fence: the
//     web is backdrop decoration, and a blanket `touch-action: none` would pass claim one and eat
//     the page).

import { expect, test } from "@playwright/experimental-ct-react";
import { ambientCeiling, boxCentre, fingerprintDelta, frameFingerprint, touchDrag, waitFrames } from "../../../support/browser/weave-drive.ts";
import { WeaveBox, WeaveScrollBox, WeaveTouchBox } from "./web-weave.fixtures.tsx";

// The whole suite runs as a touch device: `hasTouch` flips `matchMedia("(pointer: coarse)")` in
// chromium and enables the touch input pipeline (the tests/ui/touch-target-floor.suite.ct.tsx precedent).
test.use({ hasTouch: true });

/** How far past the worst ambient beat a drive must move the frame to count as a ring. */
const RING_FACTOR = 3;

test("instrument control: the CT context is a COARSE-pointer touch device", async ({ mount, page }) => {
  await mount(<WeaveTouchBox state="settled" />);
  const probe = await page.evaluate(() => ({
    coarse: matchMedia("(pointer: coarse)").matches,
    touch: "ontouchstart" in globalThis,
    maxTouchPoints: navigator.maxTouchPoints,
  }));
  expect(probe.coarse, "hasTouch must flip @media(pointer: coarse)").toBe(true);
  expect(probe.touch, "the touch event pipeline must exist").toBe(true);
  // ONESHOT-OK: the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(probe.maxTouchPoints).toBeGreaterThan(0);
});

test("a THUMB dragged across the silk rings it — the painted web changes beyond its own motion", async ({ mount, page }) => {
  await mount(<WeaveTouchBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toBeVisible();
  await expect.poll(async () => Number(await canvas.getAttribute("data-orb-weave-frames"))).toBeGreaterThan(2);
  const ceiling = await ambientCeiling(page, canvas);
  const before = await frameFingerprint(canvas);
  // A real finger drawn across the middle of the web, where the capture spiral is dense.
  const mid = await boxCentre(canvas);
  await touchDrag(page, { x: mid.x - 140, y: mid.y - 60 }, { x: mid.x + 40, y: mid.y + 20 }, 12);
  await waitFrames(page, 2);
  const rung = fingerprintDelta(before, await frameFingerprint(canvas));
  expect(rung, "a thumb must ring the silk exactly as a mouse does").toBeGreaterThan(ceiling * RING_FACTOR);
});

test("instrument control: the SAME thumb drag over a non-interactive weave changes nothing", async ({ mount, page }) => {
  // Without this the ring verdict above is unfalsifiable: a web whose own beat outran the baseline
  // would read identically. Decoration by default must stay inert under a finger.
  await mount(<WeaveBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => Number(await canvas.getAttribute("data-orb-weave-frames"))).toBeGreaterThan(2);
  const ceiling = await ambientCeiling(page, canvas);
  const before = await frameFingerprint(canvas);
  const mid = await boxCentre(canvas);
  await touchDrag(page, { x: mid.x - 140, y: mid.y - 60 }, { x: mid.x + 40, y: mid.y + 20 }, 12);
  await waitFrames(page, 2);
  const moved = fingerprintDelta(before, await frameFingerprint(canvas));
  expect(moved, "an inert weave must stay within its own ambient motion").toBeLessThanOrEqual(ceiling * RING_FACTOR);
});

test("reduced motion: a thumb rings NOTHING — the one static frame stays exactly as painted (§3.9 REMOVE)", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<WeaveTouchBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  // Settled snapshot: the frames attribute above proves the single static frame landed; under reduced
  // motion nothing repaints until an explicit change, so this read is of settled state.
  const before = await frameFingerprint(canvas);
  const mid = await boxCentre(canvas);
  await touchDrag(page, { x: mid.x - 140, y: mid.y - 60 }, { x: mid.x + 40, y: mid.y + 20 }, 12);
  await waitFrames(page, 5);
  // No extra frame was painted AND the pixels are byte-identical — the pluck is REMOVED, not damped.
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  expect(await frameFingerprint(canvas)).toBe(before);
});

test("the web does NOT eat scroll: a vertical thumb drag over a weave behind scrollable content still scrolls it", async ({ mount, page }) => {
  await mount(<WeaveScrollBox />);
  const scroller = page.locator('[data-testid="ct-weave-scroller"]');
  await expect(scroller).toBeVisible();
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => Number(await canvas.getAttribute("data-orb-weave-frames"))).toBeGreaterThan(2);
  // ONESHOT-OK: a freshly-mounted scroller is at the top by construction; this pins the start line.
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
  const mid = await boxCentre(canvas);
  // A long, unambiguously VERTICAL drag — the gesture a reader makes over the backdrop.
  await touchDrag(page, { x: mid.x, y: mid.y + 120 }, { x: mid.x, y: mid.y - 120 }, 12);
  await expect.poll(async () => scroller.evaluate((el) => el.scrollTop), { message: "the backdrop must not swallow the scroll gesture" }).toBeGreaterThan(0);
});
