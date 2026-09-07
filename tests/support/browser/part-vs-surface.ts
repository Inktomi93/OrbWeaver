// THE COMPOSITED PART-VS-SURFACE KERNEL — one home for "does this graphic read against the surface it is
// painted on", in the CT browser (#682 / #685 / #692 / #693).
//
// WHY IT IS SHARED. Three files now ask the same question about the same defect family (the arc meter's
// track and fill, the ring gauge's track, the waystone's dial track), and two instruments that disagree
// about what is behind a stroke is exactly the failure `tests/support/ct/pixel-contrast.ts` was written to
// avoid. That file is the OTHER instrument — it screenshots and reads the framebuffer, which is what an
// INK over arbitrary art needs. This one is for a part whose backing is a SINGLE known surface element:
// no screenshot, no decode, just the two resolved colours the browser hands back.
//
// IT COMPOSITES, AND THAT IS REQUIRED, NOT A REFINEMENT. The moment a candidate token carries ALPHA
// (`--color-border` is an ink at 8-14%), reading it straight through a canvas measures it over TRANSPARENT
// BLACK — which on a white panel reports a near-black stroke and a spectacular fake ratio. Painting
// surface-then-part is what the reader sees, and it is byte-identical for an opaque token.
//
// IT IS PASSED DIRECTLY TO `evaluate`, NEVER WRAPPED. Playwright serialises ONLY the function it is handed,
// so a helper that closed over another module-scope binding arrives in the page as a ReferenceError. Every
// binding this function needs is declared inside it.

/**
 * The WCAG ratio between one descendant part's resolved `color` and its surface element's resolved
 * `background-color`, measured on framebuffer pixels.
 *
 * Usage: `await locator.evaluate(partVsSurface, 'circle:not([data-slot])')` — the locator IS the surface
 * (the element whose background the part is painted on), the argument selects the part inside it.
 *
 * REFUSES rather than fabricating: an unmatched selector or a canvas-less environment throws, so
 * "I could not measure" can never read as a passing number.
 */
export function partVsSurface(surface: Element, selector: string): number {
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
  const lumOfPixel = (): number => {
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    const [lr, lg, lb] = [r ?? 0, g ?? 0, b ?? 0].map((v) => {
      const c = v / 255;
      return c <= 0.039_28 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
  };
  ctx.fillStyle = getComputedStyle(surface).backgroundColor;
  ctx.fillRect(0, 0, 1, 1);
  const surfaceLum = lumOfPixel();
  ctx.fillStyle = getComputedStyle(part).color;
  ctx.fillRect(0, 0, 1, 1);
  const partLum = lumOfPixel();
  return (Math.max(partLum, surfaceLum) + 0.05) / (Math.min(partLum, surfaceLum) + 0.05);
}
