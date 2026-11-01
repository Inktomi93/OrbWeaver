// Where the design-audit pixel pass reads a backdrop, per subject. The fixtures are rasters, not browsers:
// the rule under test is which pixels count and when a ring is refused.
import { expect, test } from "@orb/testkit/tooling";
import { ringBackdropOfRegion, uniformRingBackdropOfRegion } from "@orb/tooling/floor/instrument/pixel-backdrop";
import type { PixelRaw } from "../../../../tooling/src/ui-audit/lib/pixel-regions.ts";
import { OFF_SCREEN_REFUSAL, surroundBackdropRing, textBackdropRing } from "../../../../tooling/src/ui-audit/lib/pixel-regions.ts";

const CHANNELS = 4;
const TILE_RGB = 20;
const CARD_RGB = 200;
const FEATHER_PX = 12;

function raster(width: number, height: number, pixel: (x: number, y: number) => number): PixelRaw {
  const data = Buffer.alloc(width * height * CHANNELS);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      data.fill(value, (y * width + x) * CHANNELS, (y * width + x) * CHANNELS + 3);
    }
  }
  return { data, info: { width, height, channels: CHANNELS } };
}

/** A dark tile whose edge feathers out to the light card behind it: the shape of an echo-fallback tile. */
function featheredTile(): PixelRaw {
  return raster(100, 60, (x, y) => {
    const edge = Math.min(x, y, 99 - x, 59 - y);
    return edge >= FEATHER_PX ? TILE_RGB : Math.round(CARD_RGB + ((TILE_RGB - CARD_RGB) * edge) / FEATHER_PX);
  });
}

const TILE_BOX = { x: 0, y: 0, width: 100, height: 60 };
const LETTER_BOX = { x: 40, y: 22, width: 20, height: 16 };

test("a letter in a feathered tile reads the tile's centre, not the feather", () => {
  const tile = featheredTile();
  // CONTROL: the old element-edge ring lands in the feather and reports a colour nothing behind the letter has.
  const old = ringBackdropOfRegion(tile.data, 100, CHANNELS, { left: 0, top: 0, width: 100, height: 60 });
  expect(old.r).toBeGreaterThan(100);
  expect(textBackdropRing(tile, TILE_BOX, LETTER_BOX)).toEqual({ color: { r: TILE_RGB, g: TILE_RGB, b: TILE_RGB } });
});

test("a ring across the feather is refused, never reported as a median", () => {
  expect(textBackdropRing(featheredTile(), TILE_BOX)).toEqual({ refusal: expect.stringContaining("not uniform") });
});

test("a planted two-surface ring is non-uniform", () => {
  const split = raster(40, 40, (x) => (x < 20 ? 10 : 240));
  expect(uniformRingBackdropOfRegion(split.data, 40, CHANNELS, { left: 0, top: 0, width: 40, height: 40 })).toBeNull();
});

test("a box outside the screenshot is an off-screen refusal", () => {
  expect(textBackdropRing(featheredTile(), { x: 500, y: 500, width: 10, height: 10 })).toEqual({ refusal: OFF_SCREEN_REFUSAL });
});

test("a control's surround is the band outside its box", () => {
  const field = raster(100, 60, (x, y) => (x >= 30 && x < 70 && y >= 20 && y < 40 ? 0 : 180));
  expect(surroundBackdropRing(field, { x: 30, y: 20, width: 40, height: 20 })).toEqual({ color: { r: 180, g: 180, b: 180 } });
});

test("a surround split across two surfaces, or off the screenshot edge, is refused", () => {
  const split = raster(100, 60, (x) => (x < 50 ? 20 : 220));
  expect(surroundBackdropRing(split, { x: 30, y: 20, width: 40, height: 20 })).toEqual({ refusal: expect.stringContaining("not uniform") });
  expect(surroundBackdropRing(split, { x: 2, y: 20, width: 40, height: 20 })).toEqual({ refusal: "surround is off-screen" });
});
