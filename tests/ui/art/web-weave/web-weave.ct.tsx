// <WebWeave> CT (docs/history/design/login-loading-screen.md §4.1/§9.8) — what only a browser can prove:
//   • the canvas actually PAINTS (a pixel-alpha probe, with an instrument control on a blank canvas —
//     a probe that can't read zero can't prove painting);
//   • reduced motion mounts NO rAF loop at all (guide §3.9 REMOVE — the frame-counter seam holds
//     still across a real wait, and the single static frame still paints the settled web);
//   • the palette re-resolves on a theme flip (the canvas is token-driven even though canvas can't
//     consume var() — the painted frame changes when a color token changes);
//   • the strand-out / partial states mount and paint (their geometry is proven in the unit test).
// Token values come from the generated TOKENS map — never a hardcoded color literal (§13.7).
//
// The frame-fingerprint instruments live in tests/support/browser/weave-drive.ts, shared with the coarse-
// pointer suite. A drive verdict is measured against `ambientCeiling`, NEVER a single two-frame
// reading: the weave's own beat is neither small nor steady (back-to-back idle deltas on one settled
// mount ranged 16k–136k, the glint sweep dominating), so a one-sample baseline is a lottery that
// flakes red on a high sample and passes a drive that did nothing on a low one.

import { TOKENS } from "@orb/ui/tokens";
import type { WeavePoint } from "@orb/ui/web-weave";
import { buildWeb } from "@orb/ui/web-weave";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { ambientCeiling, fingerprintDelta, frameFingerprint, waitFrames } from "../../../support/browser/weave-drive.ts";
import { WeaveBox, WeaveTouchBox } from "./web-weave.fixtures.tsx";

/** How far past the worst ambient beat a drive must move the frame to count as a real change. */
const CHANGE_FACTOR = 3;

/** The fixture's host box and the component's own defaults — the geometry is deterministic per
 *  (size, hub, seed), so the hunt drive can aim at a strand the web ACTUALLY has rather than at a
 *  guessed coordinate. A guessed point sits in a gap between strands often enough to flake: the
 *  pluck hit radius is ~10px, and a sweep that never rang is indistinguishable from a weaver who
 *  ignored it. (Measured: a hand-picked target missed on 1 run in 3.) */
const HUNT_HOST = { width: 640, height: 420, hub: { x: 0.5, y: 0.42 }, seed: 7 } as const;

/** A real point on the capture spiral, far enough from the hub to clear her 24px doorstep deadzone
 *  and to make the walk out unmistakable. Derived, not guessed. */
function huntTarget(): { target: WeavePoint; hub: WeavePoint } {
  const web = buildWeb(HUNT_HOST);
  const hub = web.hub;
  const far = web.capture.pts.filter((p) => Math.hypot(p.x - hub.x, p.y - hub.y) > 90);
  const target = far[Math.floor(far.length / 2)] ?? (web.capture.pts[0] as WeavePoint);
  return { target, hub };
}

/** Count of non-transparent pixels on the weave canvas (0 = nothing painted). */
function paintedPixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (ctx === null) {
      return -1;
    }
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] as number) > 0) {
        painted += 1;
      }
    }
    return painted;
  });
}

/** Half-edge of the box the hunt probe reads, in CSS px — a touch wider than her ~14px body so she
 *  registers wherever inside the disturbance neighbourhood she settles to palpate. */
const HUNT_PROBE_HALF_PX = 22;

/**
 * SOLID-body mass inside a CSS-px box centred on `at`: pixels that are opaque AND whose four
 * neighbours are opaque too.
 *
 * A plain painted-pixel count cannot see her. The probe window sits on the capture spiral, so ~900
 * of its ~1900 pixels are already silk and her ~14px body is a ripple on that — measured on this
 * very mount, resting read 909 and mid-hunt read 818, i.e. the ambient beat swamped the signal and
 * inverted it. Silk is a 1px stroke and therefore has no INTERIOR: this filter reads ~0 for any
 * amount of it and tens for a filled abdomen. The weaver is the only solid thing the painters draw.
 */
function solidPixelsAround(canvas: Locator, at: { x: number; y: number }, half: number): Promise<number> {
  return canvas.evaluate(
    (el, probe) => {
      const c = el as HTMLCanvasElement;
      const ctx = c.getContext("2d");
      if (ctx === null) {
        return -1;
      }
      const scale = c.width / c.clientWidth;
      const x = Math.max(0, Math.round((probe.x - probe.half) * scale));
      const y = Math.max(0, Math.round((probe.y - probe.half) * scale));
      const w = Math.min(c.width - x, Math.round(probe.half * 2 * scale));
      const h = Math.min(c.height - y, Math.round(probe.half * 2 * scale));
      if (w <= 0 || h <= 0) {
        return -1;
      }
      const data = ctx.getImageData(x, y, w, h).data;
      const alphaAt = (px: number, py: number): number => (data[(py * w + px) * 4 + 3] as number) ?? 0;
      // A generous floor: her body is opaque; an antialiased silk edge is not.
      const solidFloor = 128;
      let solid = 0;
      for (let py = 1; py < h - 1; py++) {
        for (let px = 1; px < w - 1; px++) {
          const opaque =
            alphaAt(px, py) >= solidFloor &&
            alphaAt(px - 1, py) >= solidFloor &&
            alphaAt(px + 1, py) >= solidFloor &&
            alphaAt(px, py - 1) >= solidFloor &&
            alphaAt(px, py + 1) >= solidFloor;
          if (opaque) {
            solid += 1;
          }
        }
      }
      return solid;
    },
    { x: at.x, y: at.y, half },
  );
}

/** Solid-pixel count that still reads as BARE SILK: a strand crossing plus a dew halo can leave a
 *  pixel or two passing the interior test, where her body leaves tens. */
const BARE_SILK_MAX = 6;

/** Sweep a real cursor along the silk THROUGH `target` (host-relative CSS px), radially — the pass
 *  runs across the capture rings rather than along one, so several strands come inside the ~10px
 *  pluck radius and a ring is certain. */
async function sweepAcross(page: Page, origin: { x: number; y: number }, target: WeavePoint, hub: WeavePoint): Promise<void> {
  const dx = target.x - hub.x;
  const dy = target.y - hub.y;
  const len = Math.hypot(dx, dy) || 1;
  const step = { x: (dx / len) * 34, y: (dy / len) * 34 };
  await page.mouse.move(origin.x + target.x - step.x, origin.y + target.y - step.y);
  await page.mouse.move(origin.x + target.x, origin.y + target.y, { steps: 12 });
  await page.mouse.move(origin.x + target.x + step.x * 0.5, origin.y + target.y + step.y * 0.5, { steps: 8 });
}

test("the settled web PAINTS — and the probe itself can read a blank canvas (instrument control)", async ({ mount, page }) => {
  // The planted control FIRST: a fresh untouched canvas must probe to exactly zero — otherwise a
  // "painted" verdict below is the instrument failing open.
  const blank = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 100;
    c.height = 100;
    const data = c.getContext("2d")?.getImageData(0, 0, 100, 100).data ?? new Uint8ClampedArray([255]);
    let painted = 0;
    for (let i = 3; i < data.length; i += 4) {
      if ((data[i] as number) > 0) {
        painted += 1;
      }
    }
    return painted;
  });
  // ONESHOT-OK: probes a canvas created inside that very evaluate — no async state exists to settle.
  expect(blank).toBe(0);

  await mount(<WeaveBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toBeVisible();
  // The settled web + dew paint thousands of pixels; anything real clears this floor easily.
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
});

test("weaving builds over time — later frames carry MORE silk than the first beat", async ({ mount, page }) => {
  await mount(<WeaveBox state="weaving" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(0);
  const early = await paintedPixels(canvas);
  // Later in the build (radii underway on the calmed ~12s timeline) the web must have grown well
  // past the first beat's strands.
  await expect.poll(async () => paintedPixels(canvas), { timeout: 15_000 }).toBeGreaterThan(early * 3);
});

test("reduced motion: NO rAF loop (frame counter holds still) and the static settled web still paints", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<WeaveBox state="weaving" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  // One static paint happened…
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
  // …and the counter STAYS at one across ~30 real browser frames — a loop that existed would have
  // painted every one of them (the REMOVE proof, not merely slow — §3.9).
  await waitFrames(page, 30);
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
});

test("the palette re-resolves on a theme flip — the painted silk changes with the tokens", async ({ mount, page }) => {
  // Reduced motion makes the repaint deterministic (exactly one static frame per palette change).
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<WeaveBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  // Settled snapshot: the frames attribute above proved the static paint landed; in reduced motion
  // nothing repaints until a theme flip, so this read is of settled state.
  const fingerprintBefore = await frameFingerprint(canvas);
  // Flip the FOREGROUND token (the silk's source) on the root — the component's theme observer must
  // re-resolve and repaint. The replacement value comes from the generated TOKENS map (no literal).
  await page.evaluate(
    ([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar as string, value as string);
    },
    [TOKENS["color.foreground"].cssVar, TOKENS["color.sky-day"].value],
  );
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "2");
  // Settled snapshot: frames=2 proved the repaint landed and reduced motion paints exactly once per
  // change — the frame is settled at this read.
  const fingerprintAfter = await frameFingerprint(canvas);
  expect(fingerprintAfter).not.toBe(fingerprintBefore);
});

test("partial (the first-run half-woven web) carries visibly less silk than settled", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const component = await mount(<WeaveBox state="partial" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  const partialPixels = await paintedPixels(canvas);
  // Settled snapshot: the frames attribute above proved the static frame painted and nothing else repaints.
  expect(partialPixels).toBeGreaterThan(1000);
  await component.update(<WeaveBox state="settled" />);
  // The state change rebuilds + repaints once (frames resets with the effect teardown).
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(partialPixels);
});

test("settled ANIMATED runs off the offscreen cache — the loop advances AND the baked web recolors on a theme flip", async ({ mount, page }) => {
  // NOT reduced motion → the animated resting path: the static web is baked once and blitted each
  // frame, with only the live layers (dew/glint/spider) repainted. This is the P1 hot path.
  await mount(<WeaveBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
  // The rAF loop is genuinely running (the counter climbs across real browser frames).
  const framesEarly = Number(await canvas.getAttribute("data-orb-weave-frames"));
  await waitFrames(page, 10);
  const framesLater = Number(await canvas.getAttribute("data-orb-weave-frames"));
  // ONESHOT-OK: the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(framesLater).toBeGreaterThan(framesEarly);
  // Establish the AMBIENT ceiling (glint/dew/spider) with NO token change — a max over repeated
  // short and long spans, because one two-frame sample of this web is a lottery, not a floor …
  const ceiling = await ambientCeiling(page, canvas);
  const before = await frameFingerprint(canvas);
  // … then flip the FOREGROUND token dramatically. The silk (the bulk of the painted mass) is baked
  // into the cache, so this recolor proves the cache INVALIDATES + RE-BAKES with the new palette — it
  // would stay stale if the theme observer didn't clear `baked`. The recolor must dwarf motion noise.
  await page.evaluate(
    ([cssVar, value]) => {
      document.documentElement.style.setProperty(cssVar as string, value as string);
    },
    [TOKENS["color.foreground"].cssVar, TOKENS["color.sky-day"].value],
  );
  await waitFrames(page, 3);
  const flip = fingerprintDelta(before, await frameFingerprint(canvas));
  expect(flip, "a whole-palette re-bake must dwarf the web's own ambient beat").toBeGreaterThan(ceiling * CHANGE_FACTOR);
});

/** The ambient-budget window: long enough that a 2:1 cadence is unambiguous, short enough to stay
 *  inside a rung strand's 1500ms life for the un-throttle arm. */
const CADENCE_FRAMES = 60;
/** A quiet web must paint well under the browser's refresh… */
const QUIET_CEILING = CADENCE_FRAMES * 0.7;
/** …but must still be ANIMATING (the budget is a cadence, not a freeze — reduced motion is the freeze). */
const QUIET_FLOOR = CADENCE_FRAMES * 0.2;
/** …and a rung web must be back at (near) 1:1. */
const RUNG_FLOOR = CADENCE_FRAMES * 0.85;

/** Weave frames painted across `frames` real browser frames. */
async function paintedOver(page: Page, canvas: Locator, frames: number): Promise<number> {
  const before = Number(await canvas.getAttribute("data-orb-weave-frames"));
  await waitFrames(page, frames);
  return Number(await canvas.getAttribute("data-orb-weave-frames")) - before;
}

test("the QUIET settled web paints on an AMBIENT BUDGET — and a rung strand puts it straight back to full refresh", async ({ mount, page }) => {
  // #467 (owner-reported): the pre-auth login web idled at the display's refresh rate forever, re-running
  // the whole live-layer pass for sub-pixel deltas. Nothing on a resting web moves faster than ~2Hz, so
  // the quiet phase is budgeted — and this pins BOTH halves, because a budget that never lifts would be
  // a "reduced mode" (banned) rather than a phase.
  await mount(<WeaveTouchBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
  // Let her finish placing herself and settle to rest before reading the quiet cadence.
  await waitFrames(page, 30);

  const quiet = await paintedOver(page, canvas, CADENCE_FRAMES);
  expect(quiet, "an idle web must not paint every browser frame").toBeLessThan(QUIET_CEILING);
  expect(quiet, "…but it must still be breathing, not frozen").toBeGreaterThan(QUIET_FLOOR);

  // Ring the silk where the capture spiral is dense — a live pluck is a per-point deformation the
  // budget must yield to instantly.
  const box = await canvas.boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await page.mouse.move(cx - 140, cy - 60);
  await page.mouse.move(cx - 40, cy - 20, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
  const rung = await paintedOver(page, canvas, CADENCE_FRAMES);
  expect(rung, "a rung / hunted web must paint at the browser's own refresh").toBeGreaterThan(RUNG_FLOOR);

  // …and it COMES BACK. The ring dies at 1500ms and the shiver it raised decays exponentially — an
  // exponential that never reached zero would hold the web at full refresh (and off its offscreen
  // cache) for minutes after an idle mouse pass, which is most of what #467 actually was.
  await expect
    .poll(async () => paintedOver(page, canvas, CADENCE_FRAMES), { timeout: 20_000, message: "the budget must return once the silk stops ringing" })
    .toBeLessThan(QUIET_CEILING);
});

test("decoration by default: pointer-transparent AND hidden from assistive tech", async ({ mount, page }) => {
  await mount(<WeaveBox state="settled" />);
  const root = page.locator('[data-slot="web-weave"]');
  await expect(root).toHaveAttribute("aria-hidden", "true");
  await expect(root).toHaveCSS("pointer-events", "none");
});

test("interactive takes POINTER events and still stays hidden from assistive tech", async ({ mount, page }) => {
  // The a11y ruling (variants.ts): un-hiding a nameless canvas would promise an affordance that has no
  // keyboard path and announces nothing. Ornament that answers a cursor is still ornament.
  await mount(<WeaveTouchBox state="settled" />);
  const root = page.locator('[data-slot="web-weave"]');
  await expect(root).toHaveCSS("pointer-events", "auto");
  await expect(root).toHaveAttribute("aria-hidden", "true");
});

test("interactive: dragging across the silk RINGS it — the painted web changes beyond its own motion", async ({ mount, page }) => {
  await mount(<WeaveTouchBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
  // The AMBIENT ceiling first (glint + dew + spider, nothing touched) — sampled over repeated short
  // and long spans and maxed. A single two-frame reading here was a latent false red: idle deltas on
  // this mount span an order of magnitude, so the threshold it produced was luck, not a floor.
  const ceiling = await ambientCeiling(page, canvas);
  const before = await frameFingerprint(canvas);
  // …then drag a pointer across the middle of the web, where the capture spiral is dense.
  const box = await canvas.boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await page.mouse.move(cx - 140, cy - 60);
  await page.mouse.move(cx - 40, cy - 20, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
  await waitFrames(page, 2);
  const rung = fingerprintDelta(before, await frameFingerprint(canvas));
  // A ringing web moves far more than the worst ambient beat does.
  expect(rung, "a mouse drag must ring the silk beyond the web's own motion").toBeGreaterThan(ceiling * CHANGE_FACTOR);
});

test("instrument control: the SAME mouse drag over a NON-interactive weave changes nothing", async ({ mount, page }) => {
  // Without this the ring verdict above is unfalsifiable — a web whose own beat outran the ceiling
  // would read identically. Decoration by default must stay inert under a cursor. (The coarse-pointer
  // suite carries the matching control for a thumb; the two input paths need it separately.)
  await mount(<WeaveBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
  const ceiling = await ambientCeiling(page, canvas);
  const before = await frameFingerprint(canvas);
  const box = await canvas.boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await page.mouse.move(cx - 140, cy - 60);
  await page.mouse.move(cx - 40, cy - 20, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
  await waitFrames(page, 2);
  const moved = fingerprintDelta(before, await frameFingerprint(canvas));
  expect(moved, "an inert weave must stay within its own ambient motion").toBeLessThanOrEqual(ceiling * CHANGE_FACTOR);
});

test("interactive: the weaver HUNTS — a cursor across the silk brings her out to the disturbance and home again", async ({ mount, page }) => {
  // The predator response (web-weave-prey.ts) is unit-covered as a machine; what only a browser can
  // prove is the WIRE — that a production `interactive` host constructs her prey state, that a real
  // pointer reaches it, and that she is PAINTED out at the disturbance rather than parked at the hub.
  await mount(<WeaveTouchBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
  const box = await canvas.boundingBox();
  const origin = { x: box?.x ?? 0, y: box?.y ?? 0 };
  // A point the web ACTUALLY has silk at, well clear of her 24px doorstep deadzone — a touch nearer
  // than that is her own feet, and she correctly ignores it.
  const { target, hub } = huntTarget();
  // She is HOME at the start: the probe window is bare silk and the hub window holds her body. Both
  // halves matter — the first says the probe can read her ABSENCE, the second that it can read her.
  expect(await solidPixelsAround(canvas, target, HUNT_PROBE_HALF_PX), "the probe window must start as bare silk").toBeLessThanOrEqual(BARE_SILK_MAX);
  expect(await solidPixelsAround(canvas, hub, HUNT_PROBE_HALF_PX), "and the instrument must SEE her, at the hub, before the drive").toBeGreaterThan(
    BARE_SILK_MAX,
  );
  await sweepAcross(page, origin, target, hub);
  // She freezes (~170ms), sprints, then palpates for half a second — poll through the whole beat
  // rather than reading one frame of a moving animal.
  await expect
    .poll(async () => solidPixelsAround(canvas, target, HUNT_PROBE_HALF_PX), { timeout: 8000, message: "the weaver must come out to what touched her web" })
    .toBeGreaterThan(BARE_SILK_MAX);
  // …and she goes HOME: after the inspect beat she walks back, and the window is bare silk again.
  await expect
    .poll(async () => solidPixelsAround(canvas, target, HUNT_PROBE_HALF_PX), { timeout: 15_000, message: "she must return to the hub, not camp on the prey" })
    .toBeLessThanOrEqual(BARE_SILK_MAX);
  await expect
    .poll(async () => solidPixelsAround(canvas, hub, HUNT_PROBE_HALF_PX), { timeout: 5000, message: "…and she is back at the hub, tending" })
    .toBeGreaterThan(BARE_SILK_MAX);
});

test("instrument control: a NON-interactive weave never hunts — the same cursor leaves her at the hub", async ({ mount, page }) => {
  // The falsifier for the hunt above: without an interactive host there is no prey machine at all,
  // so the probe window must stay bare silk for the whole beat she would otherwise have crossed it in.
  await mount(<WeaveBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect.poll(async () => paintedPixels(canvas)).toBeGreaterThan(2000);
  const box = await canvas.boundingBox();
  const origin = { x: box?.x ?? 0, y: box?.y ?? 0 };
  const { target, hub } = huntTarget();
  await sweepAcross(page, origin, target, hub);
  // Long enough for the whole alert → sprint → arrive beat to have played, had one existed.
  await waitFrames(page, 120);
  expect(await solidPixelsAround(canvas, target, HUNT_PROBE_HALF_PX), "decoration must not answer a cursor").toBeLessThanOrEqual(BARE_SILK_MAX);
  expect(await solidPixelsAround(canvas, hub, HUNT_PROBE_HALF_PX), "she never left the hub").toBeGreaterThan(BARE_SILK_MAX);
});

test("reduced motion REMOVES the hunt — a cursor across the silk leaves the static frame byte-identical", async ({ mount, page }) => {
  // §3.9 REMOVE, on the predator path specifically: the pointer seam's `accepts` gate is off under
  // reduced motion, so there is no damped chase to see — there is no chase and no extra frame at all.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mount(<WeaveTouchBox state="settled" />);
  const canvas = page.locator('[data-slot="web-weave-canvas"]');
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  // Settled snapshot: the frames attribute above proves the single static frame landed; under reduced
  // motion nothing repaints until an explicit change, so this read is of settled state.
  const before = await frameFingerprint(canvas);
  const box = await canvas.boundingBox();
  const { target, hub } = huntTarget();
  await sweepAcross(page, { x: box?.x ?? 0, y: box?.y ?? 0 }, target, hub);
  await waitFrames(page, 5);
  await expect(canvas).toHaveAttribute("data-orb-weave-frames", "1");
  expect(await frameFingerprint(canvas)).toBe(before);
});
