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
 * (`resolveBackdrop` in `tooling/src/ui-audit/ops/walker/resolve.ts`) — so the arithmetic and its constants live in ONE module
 * rather than in two copies free to drift.
 *
 * THE RING, not the box: glyphs and icons sit in the box INTERIOR, so the outer ring is background by
 * construction. Sampling only the ring EXCLUDES the foreground (the hard part) instead of hoping a
 * whole-box median outvotes the text. Per-channel MEDIAN, so an anti-aliased glyph edge that does reach
 * the ring cannot drag the number.
 */

import { relativeLuminance } from "@orb/kit/theme-derivation";

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

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A region of the buffer to read the ring of. `marks` are rectangles relative to its corner whose pixels are the foreground itself, left
 *  out of the ring: a glyph that reaches the box edge puts its strokes in the ring and drags the backdrop toward its ink. */
export interface RingRegion extends PixelRect {
  marks?: readonly PixelRect[];
}

/** Per-channel median of the PERIMETER RING of a `region` inside a raw RGB(A) buffer of `imageWidth`
 *  pixels per row. `region` is in buffer pixel coordinates and MUST already sit inside the image — the
 *  caller clamps (an out-of-bounds read would silently sample the next row's pixels). */
export function ringBackdropOfRegion(data: Buffer | Uint8Array, imageWidth: number, channels: number, region: RingRegion): Rgb {
  const ring = ringPixels(data, imageWidth, channels, region);
  return { r: medianChannel(ring.rs), g: medianChannel(ring.gs), b: medianChannel(ring.bs) };
}

/** The widest p90:p10 luminance ratio a ring may show and still be ONE backdrop. A ring that spans a
 *  feathered edge or two tiles has no single colour, so its median is a number nothing on screen has. */
export const RING_MAX_SPREAD_RATIO = 1.5;
const RING_SPREAD_LOW_QUANTILE = 0.1;
const RING_SPREAD_HIGH_QUANTILE = 0.9;
/** WCAG's flare term, so a near-black ring does not read as a huge ratio over a rounding step. */
const LUMINANCE_FLARE = 0.05;

const inside = (rect: PixelRect, x: number, y: number): boolean => x >= rect.left && x < rect.left + rect.width && y >= rect.top && y < rect.top + rect.height;

interface RingSamples {
  rs: number[];
  gs: number[];
  bs: number[];
}

function sampleRing(data: Buffer | Uint8Array, imageWidth: number, channels: number, region: RingRegion): RingSamples {
  const marks = region.marks ?? [];
  const ring = Math.max(1, Math.min(SAMPLE_RING_MAX_PX, Math.floor(Math.min(region.width, region.height) * SAMPLE_RING_FRAC)));
  const samples: RingSamples = { rs: [], gs: [], bs: [] };
  for (let y = 0; y < region.height; y += 1) {
    const edgeRow = y < ring || y >= region.height - ring;
    for (let x = 0; x < region.width; x += 1) {
      if (!(edgeRow || x < ring || x >= region.width - ring) || marks.some((mark) => inside(mark, x, y))) {
        continue;
      }
      const i = ((region.top + y) * imageWidth + (region.left + x)) * channels;
      samples.rs.push(data[i] ?? 0);
      samples.gs.push(data[i + 1] ?? 0);
      samples.bs.push(data[i + 2] ?? 0);
    }
  }
  return samples;
}

// A mark that covers the whole ring means the target is the mark (a diagram that fills its box): its own edge is then the only backdrop there is.
function ringPixels(data: Buffer | Uint8Array, imageWidth: number, channels: number, region: RingRegion): RingSamples {
  const masked = sampleRing(data, imageWidth, channels, region);
  return masked.rs.length > 0 ? masked : sampleRing(data, imageWidth, channels, { ...region, marks: [] });
}

/** `ringBackdropOfRegion`, or `null` when the ring is not one backdrop (p90:p10 luminance spread over
 *  {@link RING_MAX_SPREAD_RATIO}). The caller must report the measurement unresolved, never the median. */
export function uniformRingBackdropOfRegion(data: Buffer | Uint8Array, imageWidth: number, channels: number, region: RingRegion): Rgb | null {
  const { rs, gs, bs } = ringPixels(data, imageWidth, channels, region);
  const luminances = rs.map((r, i) => relativeLuminance({ r, g: gs[i] ?? 0, b: bs[i] ?? 0 })).sort((a, b) => a - b);
  const low = percentile(luminances, RING_SPREAD_LOW_QUANTILE);
  const high = percentile(luminances, RING_SPREAD_HIGH_QUANTILE);
  if ((high + LUMINANCE_FLARE) / (low + LUMINANCE_FLARE) > RING_MAX_SPREAD_RATIO) {
    return null;
  }
  return { r: medianChannel(rs), g: medianChannel(gs), b: medianChannel(bs) };
}

/** The whole-buffer arm of {@link uniformRingBackdropOfRegion}. */
export function uniformRingBackdrop(data: Buffer | Uint8Array, width: number, height: number, channels: number): Rgb | null {
  return uniformRingBackdropOfRegion(data, width, channels, { left: 0, top: 0, width, height });
}

/** The whole-buffer arm: the buffer IS the element's shot (snap's per-element `clip` screenshot). */
export function ringBackdrop(data: Buffer | Uint8Array, width: number, height: number, channels: number): Rgb {
  return ringBackdropOfRegion(data, width, channels, { left: 0, top: 0, width, height });
}

// ── SCANLINE backdrop (issue #508) ───────────────────────────────────────────────────────────────────
//
// THE LIE THIS REPLACES. A review drive that decodes a framebuffer ROW BY ROW cannot use the ring: it has
// no box, only a horizontal cut through one. The scratch decoders reached for the obvious stand-in —
// "the backdrop is the scanline's p50, text glyphs are a minority of a text row" — and that premise is
// FALSE on a dense line: glyph + anti-aliasing pixels exceed half the row, so p50 lands ON A GLYPH.
// Measured 2026-08-22 on the rail-chats plate (reports/px-rail-chats.mjs, untracked): row y=62 read
// p50 = 0.2392 against a true plate backdrop of 0.0476–0.0504 — a ~5x overstatement, which UNDERSTATES
// every contrast ratio computed from it (the review's "compact 4.27:1" re-derives to 7.83:1 inside the
// plate). An instrument that can only err toward FAILING is not a measurement.
//
// WHAT IS TRUE INSTEAD: a plate is FLAT and glyph pixels are SPREAD (every AA ramp between backdrop and
// ink), so the backdrop is the row's MODAL luminance, not its median — and that holds at any glyph
// coverage, which is exactly the property a percentile does not have.
//
// DECLARED LIMIT, and it is why this refuses rather than guessing: the mode argument rests on the plate
// being the row's single largest FLAT population. A row with no dominant cluster (a gradient, a photo, a
// crop that straddles two surfaces) gets `null` — "I could not measure", never a number.

/** Luminance bins across [0,1]. 64 keeps a near-black plate (0.0476 and 0.0504 both land in bin 3) in ONE
 *  bucket while still separating it from the first AA step. */
export const SCANLINE_BINS = 64;
/** The share of the row the modal bin must hold before it can be called the backdrop. */
export const SCANLINE_MIN_CLUSTER_SHARE = 0.2;
/** Below this a "distribution" is a handful of pixels — no population to be modal about. */
export const SCANLINE_MIN_PIXELS = 8;

export interface ScanlineBackdrop {
  /** The estimate: median of the modal bin's members. */
  readonly luminance: number;
  /** Fraction of the row in that bin — the confidence, and what the refusal floor is measured against. */
  readonly share: number;
  /** The NAIVE estimator this exists to replace. Carry it in the receipt: a large `p50 - luminance` gap is
   *  the tell that the row is glyph-dense and that any p50-derived number in an older report is wrong. */
  readonly p50: number;
  /** The cheap low-percentile stand-in, for the same comparison. Correct only when ink is BRIGHTER than
   *  the plate; the modal estimate is polarity-free, which is why it is the one returned as `luminance`. */
  readonly p10: number;
}

/** The two comparison quantiles the receipt carries — the naive median, and the low stand-in. */
const MEDIAN_QUANTILE = 0.5;
const LOW_QUANTILE = 0.1;

function percentile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

/**
 * The backdrop luminance of ONE scanline, by modal cluster — or `null` when the row has no dominant flat
 * population and the caller must REFUSE a verdict (see the DECLARED LIMIT above).
 *
 * Ties go to the DARKER bin (the first index wins) purely for determinism; a tie means two equal flat
 * populations, which is already below the honesty floor in every case that matters.
 */
export function scanlineBackdrop(luminances: readonly number[]): ScanlineBackdrop | null {
  if (luminances.length < SCANLINE_MIN_PIXELS) {
    return null;
  }
  const bins: number[][] = Array.from({ length: SCANLINE_BINS }, () => []);
  for (const value of luminances) {
    const index = Math.min(SCANLINE_BINS - 1, Math.max(0, Math.floor(value * SCANLINE_BINS)));
    (bins[index] ?? []).push(value);
  }
  let modal: readonly number[] = [];
  for (const bin of bins) {
    if (bin.length > modal.length) {
      modal = bin;
    }
  }
  const share = modal.length / luminances.length;
  if (share < SCANLINE_MIN_CLUSTER_SHARE) {
    return null;
  }
  const sorted = [...luminances].sort((a, b) => a - b);
  return {
    luminance: medianChannel([...modal]),
    share,
    p50: percentile(sorted, MEDIAN_QUANTILE),
    p10: percentile(sorted, LOW_QUANTILE),
  };
}

/** The luminances of one horizontal cut through a raw RGB(A) buffer — the input `scanlineBackdrop` reads.
 *  `y`/`left`/`width` are buffer pixel coordinates and MUST already sit inside the image (the caller
 *  clamps — `clampBoxToImage`). Luminance is the ONE WCAG kernel, never a re-spelled sRGB curve. */
export function scanlineLuminances(data: Buffer | Uint8Array, imageWidth: number, channels: number, cut: { y: number; left: number; width: number }): number[] {
  const out: number[] = [];
  for (let x = 0; x < cut.width; x += 1) {
    const i = (cut.y * imageWidth + (cut.left + x)) * channels;
    out.push(relativeLuminance({ r: data[i] ?? 0, g: data[i + 1] ?? 0, b: data[i + 2] ?? 0 }));
  }
  return out;
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
