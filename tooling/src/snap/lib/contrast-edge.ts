// THE EDGE ARM's pure half (#1346): read a subject's BORDER strip out of a decoded framebuffer, per side,
// and measure it against the surface immediately outside that side. The browser half (the padded clip, the
// facts read, the printed lines) is ops/contrast-edge.ts; the WCAG math is the fleet kernel.
//
// WHY THIS ARM EXISTS. WCAG 1.4.11 is a question about a BOUNDARY — the visual affordance that says "this
// is a field" must clear 3:1 against what it sits on — and neither existing arm could answer it. The ink
// arm measures the subject's `color`; the fill arm measures the loudest channel of its INTERIOR against the
// band outside, so on a bordered input sitting on the same surface it fills with, it correctly refused:
// `NO VERDICT (fill-only, undecodable) — … measure the specific edge`. That remedy named no flag (measured
// 2026-09-04 on `[aria-label="Search chats"]`, and the reviewer's hand-rolled `--eval` luminance returned
// garbage on a transparent pane). This is the measurement it was asking for.
//
// PER SIDE, NEVER ONE NUMBER. A field's border is routinely uniform while its NEIGHBOURS are not (a control
// flush against a panel edge borders two surfaces), and 1.4.11 is violated by ONE indistinguishable side.
// One ratio over the whole perimeter would average the sides and hide exactly that.
//
// WHAT IS SAMPLED, and why each fence is here:
//   · the INK band is the border strip itself, from the box edge inward by that side's border width. It is
//     the MODAL colour of the strip, never a mean: a mean of a 1px border blends the anti-aliased edge into
//     the answer and reports a colour the page does not paint.
//   · the NEIGHBOUR band is the strip immediately OUTSIDE the box, separated by a feather of blended edge
//     pixels that belong to neither side.
//   · both bands stop short of the CORNERS by the corner radius plus the feather: a rounded corner's pixels
//     are a sweep between the border, the fill and the surround, and belong to no side's population.
//   · a side whose border width is 0 is SKIPPED, not failed — the page paints no boundary there, so 1.4.11
//     has nothing to say about it. A subject with no border on ANY side is refused whole (the caller sends
//     it back to `--contrast`, which measures ink and fill).
import type { Rgb } from "../../_shared/wcag.ts";
import { contrastRatio } from "../../_shared/wcag.ts";
import type { ContrastEdgeGeometry, ContrastEdgeReading, ContrastEdgeSide, ContrastEdgeSideReading, ContrastPixelImage } from "../contract/contrast.ts";
import { CONTRAST_EDGE_SIDES } from "../contract/contrast.ts";

/** Colour resolution of one bucket: 4 sRGB steps per channel — the same quantisation the fill arm uses, so
 *  the two arms cluster anti-aliased sweeps identically. */
const BUCKET_SIZE = 4;
const SRGB_LEVELS = 256;
const BUCKET_SPAN = SRGB_LEVELS / BUCKET_SIZE;

/** A band needs this many pixels before its modal colour means anything. Eight is the floor the shared
 *  scanline reader and the fill arm both use. */
const MIN_BAND_PIXELS = 8;

/** How much of a band its dominant colour must hold to BE that band's colour. A 51/49 split is exactly the
 *  ambiguity a single ratio would paper over — a border running past two surfaces, or a gradient. */
const MIN_MODAL_SHARE = 0.6;

const PERCENT = 100;

interface Bucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

interface Band {
  readonly rgb: Rgb;
  readonly share: number;
  readonly pixels: number;
}

function bucketKey(r: number, g: number, b: number): number {
  return (Math.floor(r / BUCKET_SIZE) * BUCKET_SPAN + Math.floor(g / BUCKET_SIZE)) * BUCKET_SPAN + Math.floor(b / BUCKET_SIZE);
}

/** The bucket's own MEAN colour, not its bucket centre — a reported rgb has to be a colour actually on
 *  screen, because a reviewer takes it to the token vault. */
function meanOf(bucket: Bucket): Rgb {
  return { r: Math.round(bucket.r / bucket.count), g: Math.round(bucket.g / bucket.count), b: Math.round(bucket.b / bucket.count) };
}

/** A rectangle of the clip, in image pixels, half-open on the far edge. */
interface Strip {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The modal colour of a strip, or null when the strip is empty or off the clip. */
function modalOf(image: ContrastPixelImage, strip: Strip): Band | null {
  const buckets = new Map<number, Bucket>();
  let pixels = 0;
  const x0 = Math.max(0, Math.round(strip.x0));
  const y0 = Math.max(0, Math.round(strip.y0));
  const x1 = Math.min(image.width, Math.round(strip.x1));
  const y1 = Math.min(image.height, Math.round(strip.y1));
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * image.width + x) * image.channels;
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;
      const key = bucketKey(r, g, b);
      const bucket = buckets.get(key);
      if (bucket === undefined) {
        buckets.set(key, { r, g, b, count: 1 });
      } else {
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
        bucket.count += 1;
      }
      pixels += 1;
    }
  }
  if (pixels === 0) {
    return null;
  }
  const modal = [...buckets.values()].reduce((most, bucket) => (bucket.count > most.count ? bucket : most));
  return { rgb: meanOf(modal), share: modal.count / pixels, pixels };
}

/** The two strips one side is measured from: its own border ink, and the surface just outside it. Both are
 *  trimmed at the corners by the largest radius plus the feather. */
function stripsFor(side: ContrastEdgeSide, geometry: ContrastEdgeGeometry): { readonly ink: Strip; readonly neighbour: Strip } {
  const { interior, feather, pad } = geometry;
  const border = geometry.borders[side];
  const right = interior.left + interior.width;
  const bottom = interior.top + interior.height;
  const inset = Math.max(...Object.values(geometry.radii)) + feather;
  const xInset = { x0: interior.left + inset, x1: right - inset };
  const yInset = { y0: interior.top + inset, y1: bottom - inset };
  if (side === "top") {
    return {
      ink: { ...xInset, y0: interior.top, y1: interior.top + border },
      neighbour: { ...xInset, y0: interior.top - feather - pad, y1: interior.top - feather },
    };
  }
  if (side === "bottom") {
    return {
      ink: { ...xInset, y0: bottom - border, y1: bottom },
      neighbour: { ...xInset, y0: bottom + feather, y1: bottom + feather + pad },
    };
  }
  if (side === "left") {
    return {
      ink: { ...yInset, x0: interior.left, x1: interior.left + border },
      neighbour: { ...yInset, x0: interior.left - feather - pad, x1: interior.left - feather },
    };
  }
  return {
    ink: { ...yInset, x0: right - border, x1: right },
    neighbour: { ...yInset, x0: right + feather, x1: right + feather + pad },
  };
}

function readSide(image: ContrastPixelImage, geometry: ContrastEdgeGeometry, side: ContrastEdgeSide): ContrastEdgeSideReading {
  if (geometry.borders[side] < 1) {
    return { side, kind: "skipped", reason: "no border painted on this side" };
  }
  const strips = stripsFor(side, geometry);
  const ink = modalOf(image, strips.ink);
  const neighbour = modalOf(image, strips.neighbour);
  if (ink === null || ink.pixels < MIN_BAND_PIXELS) {
    return {
      side,
      kind: "refused",
      reason: `the border strip has only ${String(ink === null ? 0 : ink.pixels)} usable pixel(s) — the box is shorter than its own corners`,
    };
  }
  if (neighbour === null || neighbour.pixels < MIN_BAND_PIXELS) {
    return { side, kind: "refused", reason: "no surround to measure against on this side — the box runs off the clip there" };
  }
  if (neighbour.share < MIN_MODAL_SHARE) {
    return {
      side,
      kind: "refused",
      reason: `this side borders more than one surface — its largest neighbour holds only ${String(Math.round(neighbour.share * PERCENT))}% of the band, so a single ratio would average colours nothing on screen paints`,
    };
  }
  return {
    side,
    kind: "measured",
    ratio: contrastRatio(ink.rgb, neighbour.rgb),
    ink: ink.rgb,
    neighbour: neighbour.rgb,
    inkShare: ink.share,
    neighbourShare: neighbour.share,
    inkPixels: ink.pixels,
    neighbourPixels: neighbour.pixels,
  };
}

/** Read every side of one decoded clip. A subject with no border ANYWHERE is refused whole rather than
 *  reported as four skips: the reader asked a question about a boundary this element does not have, and
 *  four "n/a" rows read like a pass. */
export function readEdgeChannels(image: ContrastPixelImage, geometry: ContrastEdgeGeometry): ContrastEdgeReading {
  if (CONTRAST_EDGE_SIDES.every((side) => geometry.borders[side] < 1)) {
    return { kind: "refused", refusal: "this subject paints no border on any side — there is no 1.4.11 boundary here; use --contrast for its ink or fill" };
  }
  return { kind: "measured", sides: CONTRAST_EDGE_SIDES.map((side) => readSide(image, geometry, side)) };
}
