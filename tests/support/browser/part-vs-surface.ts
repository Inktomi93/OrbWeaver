// THE COMPOSITED PART-VS-SURFACE KERNEL — one home for "does this graphic read against the surface it is
// painted on", in the CT browser.
//
// WHY IT IS SHARED. Three files ask the same question about the same defect family (the arc meter's
// track and fill, the ring gauge's track, the waystone's dial track). `pixel-contrast.ts` is the OTHER
// instrument — it screenshots and reads the framebuffer, which is what an INK over arbitrary art needs.
// This one is for a part whose backing is a SINGLE known surface element: no screenshot, no decode, just
// the two resolved colours the browser hands back. The ratio itself is the shared engine's, computed node-side.
//
// IT COMPOSITES, AND THAT IS REQUIRED, NOT A REFINEMENT. The moment a candidate token carries ALPHA
// (`--color-border` is an ink at 8-14%), reading it straight through a canvas measures it over TRANSPARENT
// BLACK — which on a white panel reports a near-black stroke and a spectacular fake ratio. Painting
// surface-then-part is what the reader sees, and it is byte-identical for an opaque token.
//
// THE IN-PAGE FUNCTION IS PASSED DIRECTLY TO `evaluate`, NEVER WRAPPED. Playwright serialises ONLY the
// function it is handed, so a helper that closed over another module-scope binding arrives in the page as a
// ReferenceError. Every binding it needs is declared inside it.

import { wcagContrastRatio } from "@orb/kit/theme-derivation";
import type { Rgb } from "@orb/tooling/floor/instrument/wcag";
import type { Locator } from "@playwright/test";

interface PartAndSurface {
  readonly part: Rgb;
  readonly surface: Rgb;
}

function resolvePartAndSurface(surface: Element, selector: string): PartAndSurface {
  const part = surface.querySelector(selector);
  if (part === null) {
    throw new Error(`partVsSurface: no "${selector}" inside the surface element`);
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("partVsSurface: no 2d context");
  }
  const pixel = (): Rgb => {
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return { r, g, b };
  };
  ctx.fillStyle = getComputedStyle(surface).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  const surfaceRgb = pixel();
  ctx.fillStyle = getComputedStyle(part).color;
  ctx.fillRect(0, 0, 1, 1);
  return { part: pixel(), surface: surfaceRgb };
}

/**
 * The WCAG ratio between one descendant part's resolved `color` and its surface element's resolved
 * `background-color`, measured on framebuffer pixels.
 *
 * Usage: `await partVsSurface(locator, 'circle:not([data-slot])')` — the locator IS the surface (the
 * element whose background the part is painted on), the selector picks the part inside it.
 *
 * REFUSES rather than fabricating: an unmatched selector or a canvas-less environment throws, so
 * "I could not measure" can never read as a passing number.
 */
export async function partVsSurface(surface: Locator, selector: string): Promise<number> {
  const colours = await surface.evaluate(resolvePartAndSurface, selector);
  return wcagContrastRatio(colours.part, colours.surface);
}
