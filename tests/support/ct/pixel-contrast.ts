// PIXEL-SAMPLED WCAG CONTRAST, in the CT browser — the over-art family's receipt instrument for a lane
// that cannot use `snap`.
//
// WHY IT EXISTS. The over-art contrast family (#167 #217 #221 #229 #232 #236 #237 #243 #468 #674) is
// decided by what is COMPOSITED on screen, and `getComputedStyle` cannot see it: a translucent plate over
// a photo, or a control on a fully transparent ancestor chain, both report a class list that says nothing
// about the pixel a reader looks at (#674's band read `rgba(0, 0, 0, 0)` all the way up while measuring
// 1.01:1). `snap --contrast --contrast-pixel` answers that on the LIVE app — but `:5173` serves MAIN, so a
// worktree lane's rendered proof has to come from the CT browser (§L.6), which is also the only place a
// lane can choose the WORST-CASE art rather than whatever wallpaper the dev account happens to carry.
//
// IT IS NOT A SECOND ALGORITHM. The ring geometry (`ringBackdrop`) and the WCAG kernel (`contrastRatio`)
// are imported from the ONE home the probe instruments already share (`@orb/tooling/_shared`), for the
// reason that module's own header states: two instruments must not disagree about what is behind a glyph.
// The only thing here is the screenshot→raw-pixels plumbing snap keeps private to its own op.

import { ringBackdrop } from "@orb/tooling/_shared/pixel-backdrop";
import type { Rgb } from "@orb/tooling/_shared/wcag";
import { contrastRatio } from "@orb/tooling/_shared/wcag";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";

export interface PixelContrastReceipt {
  /** The WCAG ratio of the element's resolved ink against its REAL composited backdrop. */
  readonly ratio: number;
  /** The element's computed `color`. */
  readonly ink: Rgb;
  /** The per-channel median of the element box's perimeter ring, read out of the framebuffer. */
  readonly backdrop: Rgb;
  /** `r,g,b` spellings — what a failing assertion prints, so a red row names the two colours. */
  readonly describe: string;
}

const show = ({ r, g, b }: Rgb): string => `${String(Math.round(r))},${String(Math.round(g))},${String(Math.round(b))}`;

/** The element's resolved ink as sRGB bytes, RESOLVED BY THE BROWSER rather than by a regex here.
 *
 *  This tree's tokens are `oklch`, and Chromium's `getComputedStyle().color` hands an oklch-authored colour
 *  straight back as `oklch(0.74 0.008 65)` — an `rgb\(…\)` regex returns nothing on it. (The first draft of
 *  this helper did exactly that and refused every measurement; the shared-memory entry is
 *  `oklch-kills-rgb-regex-probes`.) Painting the computed string into a 1x1 canvas and reading the pixel
 *  back makes the ENGINE do the conversion, so every CSS colour syntax — current and future — resolves the
 *  same way the glyph itself is rasterised. Annotated (the `tier-liveness` spelling) so the awaiting caller
 *  has a declared Promise rather than an inferred one. */
function readInk(target: Locator): Promise<Rgb> {
  return target.evaluate((element): Rgb => {
    const canvas = element.ownerDocument.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d");
    if (context === null) {
      throw new Error("pixelContrast: no 2d context to resolve the ink colour through");
    }
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
  });
}

/** Decode a PNG shot to raw RGB(A) bytes. Annotated for the same reason as `readInk`: biome's type service
 *  does not resolve sharp's builder chain and reads the awaited value as non-thenable. */
function rawPixels(shot: Buffer): Promise<{ data: Buffer; info: { width: number; height: number; channels: number } }> {
  return sharp(shot).raw().toBuffer({ resolveWithObject: true });
}

/**
 * The pixel-sampled contrast of one element's text against what is actually painted behind it.
 *
 * REFUSES rather than fabricating: an element with no box, a box entirely outside the viewport, or a
 * screenshot/decode failure throws — "I could not measure" is never a passing number (the #211 posture).
 */
export async function pixelContrast(page: Page, target: Locator): Promise<PixelContrastReceipt> {
  const box = await target.boundingBox();
  if (box === null) {
    throw new Error("pixelContrast: the target has no box (not rendered)");
  }
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("pixelContrast: the page has no viewport size");
  }
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const width = Math.min(Math.ceil(box.width), viewport.width - x);
  const height = Math.min(Math.ceil(box.height), viewport.height - y);
  if (width < 1 || height < 1) {
    throw new Error(`pixelContrast: the target box is empty or off-screen (${JSON.stringify(box)})`);
  }
  const ink = await readInk(target);
  const shot = await page.screenshot({ clip: { x, y, width, height }, animations: "disabled" });
  const { data, info } = await rawPixels(shot);
  const backdrop = ringBackdrop(data, info.width, info.height, info.channels);
  return { ratio: contrastRatio(ink, backdrop), ink, backdrop, describe: `ink ${show(ink)} on backdrop ${show(backdrop)}` };
}
