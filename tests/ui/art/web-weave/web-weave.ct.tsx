// <WebWeave> CT (docs/design/login-loading-screen.md §4.1/§9.8) — what only a browser can prove:
//   • the canvas actually PAINTS (a pixel-alpha probe, with an instrument control on a blank canvas —
//     a probe that can't read zero can't prove painting);
//   • reduced motion mounts NO rAF loop at all (guide §3.9 REMOVE — the frame-counter seam holds
//     still across a real wait, and the single static frame still paints the settled web);
//   • the palette re-resolves on a theme flip (the canvas is token-driven even though canvas can't
//     consume var() — the painted frame changes when a color token changes);
//   • the strand-out / partial states mount and paint (their geometry is proven in the unit test).
// Token values come from the generated TOKENS map — never a hardcoded color literal (§13.7).

import { TOKENS } from "@orb/ui/tokens";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { WeaveBox, WeaveTouchBox } from "./web-weave.fixtures.tsx";

/** Wait N real browser frames (rAF-driven — an event condition, not a wall-clock timeout). */
function waitFrames(page: Page, frames: number): Promise<void> {
  return page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let i = 0;
        const step = (): void => {
          i += 1;
          if (i >= n) {
            resolve();
          } else {
            requestAnimationFrame(step);
          }
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
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

/** A coarse whole-frame color fingerprint — any recolor shifts it. */
function frameFingerprint(canvas: Locator): Promise<string> {
  return canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d");
    if (ctx === null) {
      return "no-ctx";
    }
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i] as number;
      g += data[i + 1] as number;
      b += data[i + 2] as number;
    }
    return `${r}:${g}:${b}`;
  });
}

/** Channel-sum distance between two "r:g:b" fingerprints (for the cache re-bake noise-floor check). */
function fingerprintDelta(a: string, b: string): number {
  const pa = a.split(":").map(Number);
  const pb = b.split(":").map(Number);
  return Math.abs((pa[0] ?? 0) - (pb[0] ?? 0)) + Math.abs((pa[1] ?? 0) - (pb[1] ?? 0)) + Math.abs((pa[2] ?? 0) - (pb[2] ?? 0));
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
  // ONESHOT-OK: the frames attribute above just proved the static paint landed; in reduced motion
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
  // ONESHOT-OK: frames=2 above proved the repaint landed and reduced motion paints exactly once per
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
  // ONESHOT-OK: static frame proven painted by the frames attribute above; nothing else repaints.
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
  expect(framesLater).toBeGreaterThan(framesEarly);
  // Establish the frame-to-frame motion NOISE floor (glint/dew/spider) with NO token change …
  const noiseA = await frameFingerprint(canvas);
  await waitFrames(page, 2);
  const noiseB = await frameFingerprint(canvas);
  const noise = fingerprintDelta(noiseA, noiseB);
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
  const recolored = await frameFingerprint(canvas);
  const flip = Math.max(fingerprintDelta(noiseB, recolored), fingerprintDelta(noiseA, recolored));
  expect(flip).toBeGreaterThan(noise * 3 + 1);
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
  // The frame-to-frame NOISE floor first (glint + dew + spider, nothing touched)…
  const noiseA = await frameFingerprint(canvas);
  await waitFrames(page, 2);
  const noiseB = await frameFingerprint(canvas);
  const noise = fingerprintDelta(noiseA, noiseB);
  // …then drag a pointer across the middle of the web, where the capture spiral is dense.
  const box = await canvas.boundingBox();
  const cx = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const cy = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await page.mouse.move(cx - 140, cy - 60);
  await page.mouse.move(cx - 40, cy - 20, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
  await waitFrames(page, 2);
  const rung = await frameFingerprint(canvas);
  // A ringing web moves far more than the ambient beats do between two frames.
  expect(fingerprintDelta(noiseB, rung)).toBeGreaterThan(noise * 3 + 1);
});
