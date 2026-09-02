// THE FILL ARM's pixel math (#1111), on planted framebuffers — every branch of "which painted channel
// carries this control, and when is there no channel to carry it".
//
// The browser half is proved in tests/tooling/snap/ops/contrast-fill.int.test.ts against a real Chromium;
// this file exists because the REFUSALS are geometry, and geometry is cheaper (and far more precise) to
// plant as bytes than to arrange as a page: an interior thinner than its own anti-aliased edge, and an
// interior made only of anti-aliasing, are both one buffer here and a fight in a browser.
import { contrastRatio } from "../../../../tooling/src/_shared/wcag.ts";
import type { ContrastFillRegion, ContrastPixelImage } from "../../../../tooling/src/snap/contract/contrast.ts";
import { readFillChannels } from "../../../../tooling/src/snap/lib/contrast-fill.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const CHANNELS = 3;

/** A planted clip: a `surround` background with an `interior` rect painted on it, plus optional extra
 *  rects (a ring, a stripe) painted after. Colours are `[r,g,b]` so a case reads as pixels, not objects. */
function plant(
  width: number,
  height: number,
  surround: readonly [number, number, number],
  rects: readonly { readonly rect: ContrastFillRegion; readonly rgb: readonly [number, number, number] }[],
): ContrastPixelImage {
  const data = new Uint8Array(width * height * CHANNELS);
  for (let i = 0; i < width * height; i += 1) {
    data[i * CHANNELS] = surround[0];
    data[i * CHANNELS + 1] = surround[1];
    data[i * CHANNELS + 2] = surround[2];
  }
  for (const { rect, rgb } of rects) {
    for (let y = rect.top; y < rect.top + rect.height; y += 1) {
      for (let x = rect.left; x < rect.left + rect.width; x += 1) {
        const i = (y * width + x) * CHANNELS;
        data[i] = rgb[0];
        data[i + 1] = rgb[1];
        data[i + 2] = rgb[2];
      }
    }
  }
  return { data, width, height, channels: CHANNELS };
}

const BOX: ContrastFillRegion = { left: 4, top: 4, width: 32, height: 32 };
const CLIP = { width: 40, height: 40 } as const;
/** No corner radius: the subject's paint fills its whole box. */
const SQUARE = { tl: 0, tr: 0, br: 0, bl: 0 } as const;
/** A pill/circle — `rounded-full` clamps to half the short side. */
const CIRCLE = { tl: 999, tr: 999, br: 999, bl: 999 } as const;

test("a solid fill is measured against the band outside the box — the switch-thumb case", () => {
  const image = plant(CLIP.width, CLIP.height, [10, 10, 10], [{ rect: BOX, rgb: [20, 20, 20] }]);
  const reading = readFillChannels(image, { interior: BOX, radii: SQUARE, feather: 1 });
  expect(reading).toMatchObject({ channel: "fill", fill: { r: 20, g: 20, b: 20 }, surround: { r: 10, g: 10, b: 10 } });
  expect("ratio" in reading ? reading.ratio : 0).toBeCloseTo(contrastRatio({ r: 20, g: 20, b: 20 }, { r: 10, g: 10, b: 10 }), 4);
  // The whole interior is one population, so the verdict is carried by the fill itself.
  expect("share" in reading ? reading.share : 0).toBeGreaterThan(0.9);
});

test("a 2px INSET RING beats the fill it sits on, and is named as the minority channel it is", () => {
  // The fill is the surround's own colour: without the channel split this control measures 1.00:1 and a
  // working selected-state affordance (#1132) reads as invisible.
  const image = plant(
    CLIP.width,
    CLIP.height,
    [10, 10, 10],
    [
      { rect: BOX, rgb: [10, 10, 10] },
      { rect: { left: 4, top: 4, width: 32, height: 2 }, rgb: [255, 255, 255] },
      { rect: { left: 4, top: 34, width: 32, height: 2 }, rgb: [255, 255, 255] },
      { rect: { left: 4, top: 4, width: 2, height: 32 }, rgb: [255, 255, 255] },
      { rect: { left: 34, top: 4, width: 2, height: 32 }, rgb: [255, 255, 255] },
    ],
  );
  const reading = readFillChannels(image, { interior: BOX, radii: SQUARE, feather: 1 });
  expect(reading).toMatchObject({ channel: "inset-edge", fill: { r: 255, g: 255, b: 255 } });
  expect("ratio" in reading ? reading.ratio : 0).toBeGreaterThan(3);
  expect("share" in reading ? reading.share : 1).toBeLessThan(0.5);
});

test("a ROUND subject does not own its box corners — what shows through them is surround, not a channel", () => {
  // THE LIVE MIS-READ, reproduced (measured 2026-09-02 on `[data-slot=switch-thumb]` before the shape
  // was read): a `rounded-full` thumb inside an ember accent track. Its box corners are the TRACK, and
  // counting them as one of the thumb's own populations printed `FILL 7.44:1 PASS · 247,127,32` — the
  // accent colour, which the thumb does not paint. Here the same geometry: a dim circle inside a bright
  // square, on a dim surround. Only the corner-aware split can answer the quiet fill.
  const image = plant(CLIP.width, CLIP.height, [10, 10, 10], [{ rect: BOX, rgb: [247, 127, 32] }]);
  // Repaint the inscribed circle as the actual fill.
  const centre = { x: BOX.left + BOX.width / 2, y: BOX.top + BOX.height / 2 };
  for (let y = 0; y < CLIP.height; y += 1) {
    for (let x = 0; x < CLIP.width; x += 1) {
      if (Math.hypot(x + 0.5 - centre.x, y + 0.5 - centre.y) <= BOX.width / 2) {
        const i = (y * CLIP.width + x) * CHANNELS;
        image.data[i] = 20;
        image.data[i + 1] = 20;
        image.data[i + 2] = 20;
      }
    }
  }
  const round = readFillChannels(image, { interior: BOX, radii: CIRCLE, feather: 1 });
  expect(round).toMatchObject({ channel: "fill", fill: { r: 20, g: 20, b: 20 } });
  expect("ratio" in round ? round.ratio : 0).toBeLessThan(1.5);
  // The counterfactual: read the SAME pixels as a square and the corners carry a loud false verdict.
  const square = readFillChannels(image, { interior: BOX, radii: SQUARE, feather: 1 });
  expect(square).toMatchObject({ fill: { r: 247, g: 127, b: 32 } });
  expect("ratio" in square ? square.ratio : 0).toBeGreaterThan(3);
});

test("a subject bordering TWO surfaces is refused — the median of a bimodal band paints nothing", () => {
  // The live shape (measured 2026-09-02): the switch thumb is flush with its track vertically and inset
  // horizontally, so half its band is the ember track and half is the card behind it. A median across
  // those two is a colour on neither surface — and quoting it is the class of number this arm replaced.
  const image = plant(
    CLIP.width,
    CLIP.height,
    [10, 10, 10],
    [
      { rect: { left: 0, top: 0, width: CLIP.width, height: 20 }, rgb: [247, 127, 32] },
      { rect: BOX, rgb: [20, 20, 20] },
    ],
  );
  const reading = readFillChannels(image, { interior: BOX, radii: SQUARE, feather: 1 });
  expect(reading).toMatchObject({ refusal: expect.stringContaining("borders more than one surface") as unknown as string });
});

test("no band outside the box is a REFUSAL, never a ratio — the element fills the clip", () => {
  const full: ContrastFillRegion = { left: 0, top: 0, width: CLIP.width, height: CLIP.height };
  const image = plant(CLIP.width, CLIP.height, [10, 10, 10], [{ rect: full, rgb: [20, 20, 20] }]);
  const reading = readFillChannels(image, { interior: full, radii: SQUARE, feather: 1 });
  expect(reading).toMatchObject({ refusal: expect.stringContaining("no surround to measure against") as unknown as string });
  expect("ratio" in reading).toBe(false);
});

test("a box thinner than its own feathered edge is a REFUSAL — there is no interior to read", () => {
  const hairline: ContrastFillRegion = { left: 4, top: 20, width: 32, height: 2 };
  const image = plant(CLIP.width, CLIP.height, [10, 10, 10], [{ rect: hairline, rgb: [255, 255, 255] }]);
  const reading = readFillChannels(image, { interior: hairline, radii: SQUARE, feather: 1 });
  expect(reading).toMatchObject({ refusal: expect.stringContaining("no interior pixels") as unknown as string });
});

test("an interior that is ONLY anti-aliasing is refused — no population reaches the share floor", () => {
  // Every interior pixel its own colour: 30x30 distinct buckets, so no population holds even 0.2% of the
  // box. Without the floor the single brightest pixel would carry a 17:1 PASS nobody can see.
  const noise = Array.from({ length: 32 * 32 }, (_, i) => ({
    rect: { left: 4 + (i % 32), top: 4 + Math.floor(i / 32), width: 1, height: 1 },
    rgb: [(i % 32) * 8, Math.floor(i / 32) * 8, 0] as const,
  }));
  const image = plant(CLIP.width, CLIP.height, [10, 10, 10], noise);
  const reading = readFillChannels(image, { interior: BOX, radii: SQUARE, feather: 1 });
  expect(reading).toMatchObject({ refusal: expect.stringContaining("anti-aliasing") as unknown as string });
});
