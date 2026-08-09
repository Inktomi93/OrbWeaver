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
import { WeaveBox } from "./web-weave.fixtures.tsx";

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
