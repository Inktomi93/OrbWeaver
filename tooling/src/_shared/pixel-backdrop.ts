/**
 * PERIMETER-RING PIXEL SAMPLING — the shared "what is actually painted behind this box" reader for the
 * probe instruments (snap's `--contrast`, design-audit's contrast family).
 *
 * WHY IT IS SHARED (issue #218). Both instruments resolve a backdrop from the DOM first, and both hit the
 * same wall: a CSS ancestor walk cannot see a FIXED sibling art layer (`ThemeBackgroundLayer`) painting
 * over the base, so a translucent reading plate resolves against the near-black palette base and reports a
 * ratio nothing on screen has (3.16:1 measured where the real composite is 4.94:1 — 28 false P1s on one
 * transcript). snap already refused-and-pixel-sampled that case; design-audit fabricated a flat verdict.
 * The walker's own law says the two instruments "must not disagree about what is behind a glyph"
 * (design-audit-walker.ts, resolveBackdrop) — so the arithmetic and its constants live in ONE module
 * rather than in two copies free to drift.
 *
 * THE RING, not the box: glyphs and icons sit in the box INTERIOR, so the outer ring is background by
 * construction. Sampling only the ring EXCLUDES the foreground (the hard part) instead of hoping a
 * whole-box median outvotes the text. Per-channel MEDIAN, so an anti-aliased glyph edge that does reach
 * the ring cannot drag the number.
 */

/** Ring thickness as a fraction of the box's short side (capped by SAMPLE_RING_MAX_PX). */
export const SAMPLE_RING_FRAC = 0.15;
export const SAMPLE_RING_MAX_PX = 6;

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A CSS-pixel box in viewport coordinates (getBoundingClientRect's x/y/width/height). */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function medianChannel(values: number[]): number {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

/** Per-channel median of the PERIMETER RING of a `region` inside a raw RGB(A) buffer of `imageWidth`
 *  pixels per row. `region` is in buffer pixel coordinates and MUST already sit inside the image — the
 *  caller clamps (an out-of-bounds read would silently sample the next row's pixels). */
export function ringBackdropOfRegion(
  data: Buffer | Uint8Array,
  imageWidth: number,
  channels: number,
  region: { left: number; top: number; width: number; height: number },
): Rgb {
  const ring = Math.max(1, Math.min(SAMPLE_RING_MAX_PX, Math.floor(Math.min(region.width, region.height) * SAMPLE_RING_FRAC)));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < region.height; y += 1) {
    const edgeRow = y < ring || y >= region.height - ring;
    for (let x = 0; x < region.width; x += 1) {
      if (!(edgeRow || x < ring || x >= region.width - ring)) {
        continue;
      }
      const i = ((region.top + y) * imageWidth + (region.left + x)) * channels;
      rs.push(data[i] ?? 0);
      gs.push(data[i + 1] ?? 0);
      bs.push(data[i + 2] ?? 0);
    }
  }
  return { r: medianChannel(rs), g: medianChannel(gs), b: medianChannel(bs) };
}

/** The whole-buffer arm: the buffer IS the element's shot (snap's per-element `clip` screenshot). */
export function ringBackdrop(data: Buffer | Uint8Array, width: number, height: number, channels: number): Rgb {
  return ringBackdropOfRegion(data, width, channels, { left: 0, top: 0, width, height });
}

/** Clamp a viewport-coordinate CSS box into an image of `imageWidth`x`imageHeight` pixels, integer-aligned.
 *  Returns null when nothing of the box is inside — the caller must REFUSE a verdict rather than sample
 *  some other part of the page (the #211 posture: no evidence is not a passing measurement). */
export function clampBoxToImage(box: PixelBox, imageWidth: number, imageHeight: number): { left: number; top: number; width: number; height: number } | null {
  const left = Math.max(0, Math.floor(box.x));
  const top = Math.max(0, Math.floor(box.y));
  const width = Math.min(Math.ceil(box.x + box.width) - left, imageWidth - left);
  const height = Math.min(Math.ceil(box.y + box.height) - top, imageHeight - top);
  if (width < 1 || height < 1 || left >= imageWidth || top >= imageHeight) {
    return null;
  }
  return { left, top, width, height };
}
