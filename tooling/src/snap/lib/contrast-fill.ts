// THE FILL ARM's pure half (#1111): read a fill-only element's PAINTED CHANNELS out of a decoded
// framebuffer and measure the loudest of them against the surround it sits on. The browser half (the
// padded screenshot, the sharp decode) is ops/contrast-fill.ts; the WCAG math is the fleet kernel.
//
// THE LIE IT ENDS. `--contrast` resolved every subject's foreground through `getComputedStyle().color`.
// On an element that paints ONLY a background — a switch thumb, a swatch cell, a bare indicator — that is
// the INHERITED TEXT colour of a node with no text: a number with nothing to do with what is on screen,
// which does not move when the fill does. Measured on #1090: `[data-slot=switch-thumb]` read 16.26:1
// BEFORE and AFTER its fill changed from `bg-foreground` to `bg-muted-foreground/80`, and two side-eye
// reports cited that number as the OFF-state loudness. A coincidental ink ratio is worse than no ratio,
// because it is quotable.
//
// WHAT IS MEASURED INSTEAD, and why it is a CHANNEL rather than "the background colour":
//   · A fill-only control is not one colour. The Characters Opening strip's SELECTED state (#1132) is a
//     2px INSET RING over the same fill as unselected — a whole-box median reports the unselected colour
//     and calls a working affordance invisible. So the interior is bucketed into its painted populations
//     and the one FURTHEST from the surround wins; the report names which it was and how much of the box
//     it covers, so a reviewer can see whether the signal is the fill or a hairline.
//   · A population below `MIN_CHANNEL_SHARE` cannot win. Anti-aliasing paints a handful of pixels at every
//     step between fill and surround, and one of them always lands near the surround's opposite — without
//     a floor, every subject would "pass" on four pixels nobody can see.
//   · The surround is the BAND OUTSIDE the box, not a ring inside it (`ringBackdrop`'s geometry): on a
//     text subject the ring is background by construction, on a fill subject it IS the fill.
//   · Both are separated by a FEATHER of the element's own edge pixels, which blend the two and belong to
//     neither.
import type { Rgb } from "../../_shared/wcag.ts";
import { contrastRatio } from "../../_shared/wcag.ts";
import type { ContrastFillGeometry, ContrastFillReading, ContrastFillRegion, ContrastPixelImage } from "../contract/contrast.ts";

/** Colour resolution of one bucket: 4 sRGB steps per channel. Coarse enough that an anti-aliased sweep of
 *  one fill lands in a single population, fine enough to separate two neighbouring surface tokens. */
const BUCKET_SIZE = 4;
const SRGB_LEVELS = 256;
const BUCKET_SPAN = SRGB_LEVELS / BUCKET_SIZE;
const PERCENT = 100;

/** The share of the interior a painted population must hold before it may carry the verdict. 2% is above
 *  the anti-aliased fringe of any real box (a 2px ring on a 24px control is ~30%) and below every
 *  deliberate affordance we have measured. */
const MIN_CHANNEL_SHARE = 0.02;

/** The surround needs enough pixels for a median to mean anything. Eight is the floor the shared scanline
 *  reader uses for its modal cluster, for the same reason. */
const MIN_BAND_PIXELS = 8;

/** How much of the band its DOMINANT surface must hold before it can be called "the surround". A clear
 *  majority, not a plurality: a 51/49 border is exactly the ambiguity a single ratio would paper over,
 *  and a subject sitting on a gradient or a photo has no single neighbour at all. */
const MIN_SURROUND_SHARE = 0.6;

interface Bucket {
  r: number;
  g: number;
  b: number;
  count: number;
}

interface Split {
  readonly buckets: ReadonlyMap<number, Bucket>;
  readonly core: number;
  readonly band: Map<number, Bucket>;
  readonly bandPixels: number;
}

/** Signed distance from a pixel to the subject's painted SHAPE: negative inside, positive outside, in
 *  image pixels. The rounded-rect SDF, per corner — a background is clipped to the ROUNDED border box, so
 *  a pill's box corners are NOT its paint. Measured live on `[data-slot=switch-thumb]`: those corners are
 *  the ember accent track showing through, and treating them as one of the thumb's channels printed
 *  7.44:1 for a colour the thumb does not paint. Radii are clamped to half the box (CSS's own overflow
 *  rule scales all four together; clamping per corner differs only for radii that already overlap). */
function shapeDistance(region: ContrastFillRegion, radii: ContrastFillGeometry["radii"], x: number, y: number): number {
  const halfW = region.width / 2;
  const halfH = region.height / 2;
  const dx = x + HALF_PIXEL - (region.left + halfW);
  const dy = y + HALF_PIXEL - (region.top + halfH);
  const top = dy < 0;
  const left = dx < 0;
  const corner = cornerRadius(radii, top, left);
  const r = Math.max(0, Math.min(corner, halfW, halfH));
  // The SIGNED rounded-box distance. The outside-only form (`hypot(max(q,0)) - r`) reports 0 for every
  // interior pixel of a square, which reads as "on the edge" and left the arm with no interior at all.
  const qx = Math.abs(dx) - halfW + r;
  const qy = Math.abs(dy) - halfH + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

/** Sample the pixel's CENTRE, not its corner. */
const HALF_PIXEL = 0.5;

/** Which of the four radii governs this quadrant. */
function cornerRadius(radii: ContrastFillGeometry["radii"], top: boolean, left: boolean): number {
  if (top) {
    return left ? radii.tl : radii.tr;
  }
  return left ? radii.bl : radii.br;
}

function bucketKey(r: number, g: number, b: number): number {
  return (Math.floor(r / BUCKET_SIZE) * BUCKET_SPAN + Math.floor(g / BUCKET_SIZE)) * BUCKET_SPAN + Math.floor(b / BUCKET_SIZE);
}

/** The bucket's own MEAN colour, not its bucket centre — a reported rgb has to be a colour actually on
 *  screen, because a reviewer takes it to the token vault. */
function meanOf(bucket: Bucket): Rgb {
  return { r: Math.round(bucket.r / bucket.count), g: Math.round(bucket.g / bucket.count), b: Math.round(bucket.b / bucket.count) };
}

function addTo(buckets: Map<number, Bucket>, r: number, g: number, b: number): void {
  const key = bucketKey(r, g, b);
  const bucket = buckets.get(key);
  if (bucket === undefined) {
    buckets.set(key, { r, g, b, count: 1 });
    return;
  }
  bucket.r += r;
  bucket.g += g;
  bucket.b += b;
  bucket.count += 1;
}

/** One pass over the clip: every pixel is INSIDE the element (minus its feathered edge), OUTSIDE it (plus
 *  that feather), or in the feather itself and counted by neither. */
function splitClip(image: ContrastPixelImage, geometry: ContrastFillGeometry): Split {
  const buckets = new Map<number, Bucket>();
  const band = new Map<number, Bucket>();
  let bandPixels = 0;
  let core = 0;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const distance = shapeDistance(geometry.interior, geometry.radii, x, y);
      if (distance > -geometry.feather && distance < geometry.feather) {
        continue;
      }
      const i = (y * image.width + x) * image.channels;
      const r = image.data[i] ?? 0;
      const g = image.data[i + 1] ?? 0;
      const b = image.data[i + 2] ?? 0;
      if (distance <= -geometry.feather) {
        core += 1;
        addTo(buckets, r, g, b);
      } else {
        bandPixels += 1;
        addTo(band, r, g, b);
      }
    }
  }
  return { buckets, core, band, bandPixels };
}

/** The band's own DOMINANT surface, and how much of the band it holds. MODAL, never a median: a subject
 *  flush with its parent's edge borders TWO surfaces (the live switch thumb borders its ember track on
 *  two sides and the card on the others), and the median of a bimodal band is a colour nothing on screen
 *  paints. The same argument the shared scanline reader makes for its own modal rule. */
function dominantSurround(band: ReadonlyMap<number, Bucket>, bandPixels: number): { readonly rgb: Rgb; readonly share: number } {
  const modal = [...band.values()].reduce((most, bucket) => (bucket.count > most.count ? bucket : most));
  return { rgb: meanOf(modal), share: modal.count / bandPixels };
}

/**
 * Split one decoded clip into the element's painted populations and the band around it, then return the
 * loudest measurable channel — or the REFUSAL that says why no channel could be measured.
 *
 * `geometry` is the element's painted shape in IMAGE pixels — the caller resolves the device-pixel ratio.
 */
export function readFillChannels(image: ContrastPixelImage, geometry: ContrastFillGeometry): ContrastFillReading {
  const { buckets, core, band, bandPixels } = splitClip(image, geometry);
  if (bandPixels < MIN_BAND_PIXELS) {
    return {
      kind: "refused",
      refusal: `no surround to measure against — only ${String(bandPixels)} pixel(s) of the clip lie outside the element (it fills the viewport, or its box runs off-screen)`,
    };
  }
  if (core === 0) {
    return { kind: "refused", refusal: "no interior pixels — the element's box is thinner than its own anti-aliased edge" };
  }
  const neighbour = dominantSurround(band, bandPixels);
  if (neighbour.share < MIN_SURROUND_SHARE) {
    return {
      kind: "refused",
      // NAMES A FLAG THAT EXISTS (#1346). This sentence used to end at "measure the specific edge", which
      // no arm could do — a reviewer hand-rolled luminance in `--eval` and got garbage off a transparent
      // pane. `--contrast-edge` is that measurement, per side.
      refusal: `the subject borders more than one surface — its largest neighbour is only ${(neighbour.share * PERCENT).toFixed(0)}% of the band, so any single ratio would average colours nothing on screen paints; measure the boundary itself with --contrast-edge <selector> (per side, WCAG 1.4.11), or target a child that sits on one surface`,
    };
  }
  const surround: Rgb = neighbour.rgb;
  const populations = [...buckets.values()].filter((bucket) => bucket.count / core >= MIN_CHANNEL_SHARE);
  if (populations.length === 0) {
    return {
      kind: "refused",
      refusal: `no painted population reaches ${(MIN_CHANNEL_SHARE * PERCENT).toFixed(0)}% of the box — every colour in it is anti-aliasing`,
    };
  }
  const dominant = populations.reduce((most, bucket) => (bucket.count > most.count ? bucket : most));
  const loudest = populations.reduce((best, bucket) => (contrastRatio(meanOf(bucket), surround) > contrastRatio(meanOf(best), surround) ? bucket : best));
  return {
    kind: "measured",
    ratio: contrastRatio(meanOf(loudest), surround),
    fill: meanOf(loudest),
    surround,
    channel: loudest === dominant ? "fill" : "inset-edge",
    share: loudest.count / core,
    surroundShare: neighbour.share,
    interiorPixels: core,
    bandPixels,
  };
}
