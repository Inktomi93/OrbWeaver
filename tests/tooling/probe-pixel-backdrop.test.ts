// The shared perimeter-ring pixel sampler (scripts/probes/_kit/pixel-backdrop.ts). Home per
// Spine-Testing §2: a test of a scripts/ tool lives in tests/tooling/.
//
// WHY IT IS SHARED (issue #218): both browser instruments resolve a backdrop from the DOM and both go
// blind at the same wall — a FIXED art layer painting over the base an ancestor walk finds. snap already
// pixel-sampled that case; design-audit fabricated a flat verdict and put 28 false P1s on one transcript.
// The arithmetic now has one home so the two cannot drift apart about what is behind a glyph.
//
// The ring is the load-bearing choice: glyphs live in the box INTERIOR, so an interior-inclusive average
// would measure the text it is trying to measure text AGAINST.
import { clampBoxToImage, ringBackdropOfRegion } from "../../scripts/probes/_kit/pixel-backdrop.ts";
import { expect, test } from "../support/fixtures.ts";

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

test("a box entirely outside the image resolves to NOTHING — the caller must refuse, never sample", () => {
  // The scrolled-out transcript node. Sampling a clamped-to-zero box would measure some other element's
  // pixels and mint a verdict about a glyph that is not on screen (the retracted-P0 shape, #211).
  expect(clampBoxToImage({ x: 400, y: -719, width: 588, height: 43 }, 1280, 800)).toBeNull();
  expect(clampBoxToImage({ x: 1400, y: 100, width: 200, height: 40 }, 1280, 800)).toBeNull();
});
