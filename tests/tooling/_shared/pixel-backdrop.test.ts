// The shared perimeter-ring pixel sampler (tooling/src/_shared/pixel-backdrop.ts). Home per
// Spine-Testing §2: a test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT IS SHARED (issue #218): both browser instruments resolve a backdrop from the DOM and both go
// blind at the same wall — a FIXED art layer painting over the base an ancestor walk finds. snap already
// pixel-sampled that case; design-audit fabricated a flat verdict and put 28 false P1s on one transcript.
// The arithmetic now has one home so the two cannot drift apart about what is behind a glyph.
//
// The ring is the load-bearing choice: glyphs live in the box INTERIOR, so an interior-inclusive average
// would measure the text it is trying to measure text AGAINST.
import type { ScanlineBackdrop } from "@orb/tooling/_shared/pixel-backdrop";
import { clampBoxToImage, ringBackdropOfRegion, scanlineBackdrop, scanlineLuminances } from "@orb/tooling/_shared/pixel-backdrop";
import { expect, test } from "../../support/tool-fixtures.ts";

const CHANNELS = 4;

interface Frame {
  width: number;
  height: number;
  border: number;
  ring: readonly [number, number, number];
  fill: readonly [number, number, number];
}

/** A synthetic RGBA raster: `border` px of `ring` color around an interior of `fill`. */
function frame({ width, height, border, ring, fill }: Frame): Buffer {
  const data = Buffer.alloc(width * height * CHANNELS);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const onRing = y < border || y >= height - border || x < border || x >= width - border;
      const [r, g, b] = onRing ? ring : fill;
      const i = (y * width + x) * CHANNELS;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

test("the ring median reports the BACKDROP, not the glyphs filling the interior", () => {
  // 40x40 box: a light backdrop with near-black "text" filling the middle. An interior-inclusive average
  // would land in the mid-greys; the ring must read the backdrop verbatim.
  const data = frame({ width: 40, height: 40, border: 6, ring: [200, 195, 185], fill: [10, 10, 10] });
  expect(ringBackdropOfRegion(data, 40, CHANNELS, { left: 0, top: 0, width: 40, height: 40 })).toEqual({ r: 200, g: 195, b: 185 });
});

test("a region is read out of the MIDDLE of a bigger buffer — one screenshot, many elements", () => {
  // design-audit samples every unresolved element from ONE viewport shot, so the row stride must be the
  // IMAGE's width, never the region's: getting that wrong reads the next row's pixels and silently
  // measures a neighbouring element.
  const width = 100;
  const height = 60;
  const data = Buffer.alloc(width * height * CHANNELS);
  for (let y = 20; y < 40; y += 1) {
    for (let x = 30; x < 70; x += 1) {
      const i = (y * width + x) * CHANNELS;
      data[i] = 12;
      data[i + 1] = 34;
      data[i + 2] = 56;
      data[i + 3] = 255;
    }
  }
  expect(ringBackdropOfRegion(data, width, CHANNELS, { left: 30, top: 20, width: 40, height: 20 })).toEqual({ r: 12, g: 34, b: 56 });
});

test("a box that hangs off the viewport is CLAMPED to the pixels that exist", () => {
  expect(clampBoxToImage({ x: -20, y: 700, width: 200, height: 300 }, 1280, 800)).toEqual({ left: 0, top: 700, width: 180, height: 100 });
});

// ── SCANLINE backdrop (issue #508) — the PLANTED CONTROL for a lying estimator ────────────────────────
//
// The scratch framebuffer decoders a side-eye drive writes cannot use the ring (they cut a ROW, not a box),
// and every one of them reached for the same stand-in: "the backdrop is the scanline's p50 — glyphs are a
// minority of a text row". On a DENSE row that premise inverts, p50 lands on a glyph, and every contrast
// ratio derived from it is understated (measured: p50 0.2392 vs a true plate backdrop of ~0.049, ~5x).
// The rows below are that exact scanline, synthesised: a fixture where p50 IS the lie, so the honest
// estimator has something to be right about.
const DENSE_BACKDROP_LUM = 0.048;
const DENSE_BACKDROP_PX = 80;
const DENSE_GLYPH_PX = 120;

/** `count` luminances spread evenly across [lo,hi] — an anti-aliasing ramp: many distinct values, no
 *  cluster. This is WHY the mode works where a percentile does not: ink pixels are spread, a plate is flat. */
function ramp(count: number, lo: number, hi: number): number[] {
  return Array.from({ length: count }, (_, i) => lo + ((hi - lo) * i) / (count - 1));
}

/** Narrow the refusal away where the fixture is built to be readable — a `null` here is the test's own
 *  failure (the row it planted had no flat population), and it should say so rather than read as a miss. */
function readable(read: ScanlineBackdrop | null): ScanlineBackdrop {
  if (read === null) {
    throw new Error("scanlineBackdrop REFUSED a row this fixture planted a flat backdrop into");
  }
  return read;
}

test("a GLYPH-DENSE scanline: p50 lands on a glyph, the modal estimate finds the plate", () => {
  // 60% of the row is ink+AA — the condition that breaks the p50 premise. Both numbers come back so a
  // receipt can show the gap; only `luminance` is the verdict.
  const row = [...Array.from({ length: DENSE_BACKDROP_PX }, () => DENSE_BACKDROP_LUM), ...ramp(DENSE_GLYPH_PX, 0.1, 0.9)];
  const read = readable(scanlineBackdrop(row));

  expect(read.luminance).toBeCloseTo(DENSE_BACKDROP_LUM, 3);
  // The LIE, asserted as a lie: p50 is ~5x the true backdrop, the same overstatement the real decode hit.
  expect(read.p50).toBeGreaterThan(DENSE_BACKDROP_LUM * 4);
  expect(read.share).toBeCloseTo(DENSE_BACKDROP_PX / (DENSE_BACKDROP_PX + DENSE_GLYPH_PX), 3);
});

test("a LIGHT plate with dark ink: the mode still finds the plate where p10 cannot", () => {
  // The polarity flip is why the returned estimate is modal and not "p10 instead of p50" — a low
  // percentile is only right when ink is BRIGHTER than its backdrop, which is one theme out of two.
  const plate = 0.85;
  const row = [...Array.from({ length: DENSE_BACKDROP_PX }, () => plate), ...ramp(DENSE_GLYPH_PX, 0.05, 0.6)];
  const read = readable(scanlineBackdrop(row));

  expect(read.luminance).toBeCloseTo(plate, 2);
  expect(read.p10).toBeLessThan(plate / 2); // p10 would have reported ink as the backdrop
});

test("a row with NO flat population REFUSES — null, never a confident number", () => {
  // A gradient / photographic cut: every pixel distinct, no cluster clears the share floor. The whole
  // point of the refusal is that "I could not measure" must not read like a measurement.
  expect(scanlineBackdrop(ramp(200, 0, 1))).toBeNull();
  expect(scanlineBackdrop([0.1, 0.2, 0.3])).toBeNull(); // too few pixels to have a distribution at all
});

test("a scanline is cut out of the MIDDLE of a bigger buffer — the row stride is the IMAGE's", () => {
  // Same trap as the region test above: using the cut's width as the stride reads the wrong row and
  // silently measures a different part of the page.
  const width = 100;
  const height = 20;
  const data = Buffer.alloc(width * height * CHANNELS);
  for (let x = 30; x < 70; x += 1) {
    const i = (10 * width + x) * CHANNELS;
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
  }
  const cut = scanlineLuminances(data, width, CHANNELS, { y: 10, left: 30, width: 40 });
  expect(cut).toHaveLength(40);
  expect(cut.every((l) => l === 1)).toBe(true);
  // The row ABOVE it is untouched black — proof the reader indexed by `y`, not by luck.
  expect(scanlineLuminances(data, width, CHANNELS, { y: 9, left: 30, width: 40 }).every((l) => l === 0)).toBe(true);
});

test("a box entirely outside the image resolves to NOTHING — the caller must refuse, never sample", () => {
  // The scrolled-out transcript node. Sampling a clamped-to-zero box would measure some other element's
  // pixels and mint a verdict about a glyph that is not on screen (the retracted-P0 shape, #211).
  expect(clampBoxToImage({ x: 400, y: -719, width: 588, height: 43 }, 1280, 800)).toBeNull();
  expect(clampBoxToImage({ x: 1400, y: 100, width: 200, height: 40 }, 1280, 800)).toBeNull();
});
