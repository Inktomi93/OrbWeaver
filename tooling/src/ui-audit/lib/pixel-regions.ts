// Where on a viewport screenshot a backdrop is read, per kind of subject. Pure: the screenshot is data.
// A ring that is not one backdrop is a refusal, never a median (floor/instrument/pixel-backdrop.ts).
import type { PixelBox } from "@orb/tooling/floor/instrument/pixel-backdrop";
import { clampBoxToImage, SAMPLE_RING_MAX_PX, uniformRingBackdropOfRegion } from "@orb/tooling/floor/instrument/pixel-backdrop";
import type { Rgb } from "@orb/tooling/floor/instrument/wcag";

export interface PixelRaw {
  readonly data: Buffer | Uint8Array;
  readonly info: { readonly width: number; readonly height: number; readonly channels: number };
}

/** A ring read: the one backdrop colour, or why there is none. */
export type RingRead = { readonly color: Rgb } | { readonly refusal: string };

const NON_UNIFORM = "backdrop ring is not uniform (luminance spread over the bound)";
export const OFF_SCREEN_REFUSAL = "box is off-screen";

interface Region {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function intersect(a: Region, b: Region): Region | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const width = Math.min(a.left + a.width, b.left + b.width) - left;
  const height = Math.min(a.top + a.height, b.top + b.height) - top;
  return width < 1 || height < 1 ? null : { left, top, width, height };
}

function readRing(raw: PixelRaw, region: Region): RingRead {
  const color = uniformRingBackdropOfRegion(raw.data, raw.info.width, raw.info.channels, region);
  return color === null ? { refusal: NON_UNIFORM } : { color };
}

/** The backdrop behind text. With an ink box the ring is the band just OUTSIDE the glyphs, kept inside the
 *  element box, so a letter in a big tile reads the tile and not the tile's edge. */
export function textBackdropRing(raw: PixelRaw, box: PixelBox, inkBox?: PixelBox): RingRead {
  const element = clampBoxToImage(box, raw.info.width, raw.info.height);
  if (element === null) {
    return { refusal: OFF_SCREEN_REFUSAL };
  }
  if (inkBox === undefined) {
    return readRing(raw, element);
  }
  const padded = clampBoxToImage(
    {
      x: inkBox.x - SAMPLE_RING_MAX_PX,
      y: inkBox.y - SAMPLE_RING_MAX_PX,
      width: inkBox.width + 2 * SAMPLE_RING_MAX_PX,
      height: inkBox.height + 2 * SAMPLE_RING_MAX_PX,
    },
    raw.info.width,
    raw.info.height,
  );
  return readRing(raw, (padded === null ? null : intersect(padded, element)) ?? element);
}

/** The surface OUTSIDE a box: a control's border is judged against what surrounds it, so the ring is the
 *  band just beyond the box. Refused when that band would leave the screenshot. */
export function surroundBackdropRing(raw: PixelRaw, box: PixelBox): RingRead {
  const pad = SAMPLE_RING_MAX_PX;
  const outside = box.x - pad < 0 || box.y - pad < 0 || box.x + box.width + pad > raw.info.width || box.y + box.height + pad > raw.info.height;
  const region = outside
    ? null
    : clampBoxToImage({ x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad }, raw.info.width, raw.info.height);
  return region === null ? { refusal: "surround is off-screen" } : readRing(raw, region);
}
