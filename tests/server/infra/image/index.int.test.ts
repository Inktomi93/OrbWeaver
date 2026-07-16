// infra/image — the sharp adapter against real sharp encode/decode (integration lane). Pins resize→variant,
// the privacy metadata-strip (EXIF dropped on transform), format normalization, and non-image rejection.

import { createImageAdapter } from "@orb/server/infra/image";
import sharp from "sharp";
import { beforeAll, describe } from "vitest";
import { BANNER_WIDTHS, snapBannerWidth } from "../../../../packages/server/src/domain/assets/substrate/variant-policy.ts";
import { expect, test } from "../../../support/fixtures";

const SRC_WIDTH = 400;
const SRC_HEIGHT = 300;
const VARIANT_WIDTH = 96;
const PORTRAIT_WIDTH = 200;
const PORTRAIT_HEIGHT = 300;

// The banner block needs its OWN larger source: the smallest `BANNER_WIDTHS` rung (480) exceeds
// `pngSource`'s 400px width, and `transform` never enlarges (`withoutEnlargement: true`) — feeding
// `pngSource` in would silently cap the crop at 400px wide (ratio 2.5:1, not 3:1), a false pass. This
// source is landscape but NOT 3:1 itself (2:1), so the crop is proven genuine, not a same-ratio no-op.
const BANNER_SRC_WIDTH = 960;
const BANNER_SRC_HEIGHT = 480;

const adapter = createImageAdapter();

// A small solid PNG fixture (no metadata) + a JPEG fixture carrying EXIF (the privacy case).
let pngSource: Uint8Array;
let jpegWithExif: Uint8Array;
let bannerSource: Uint8Array;

beforeAll(async () => {
  const base = sharp({
    create: {
      width: SRC_WIDTH,
      height: SRC_HEIGHT,
      channels: 3,
      background: { r: 10, g: 20, b: 30 },
    },
  });
  pngSource = new Uint8Array(await base.clone().png().toBuffer());
  // EXIF tag identifiers are spec-defined (the `IFD0` directory + the `Copyright` tag), not camelCase.
  // biome-ignore lint/style/useNamingConvention: EXIF IFD/tag names are defined by the EXIF spec
  const exif = { IFD0: { Copyright: "orbweaver-test" } };
  jpegWithExif = new Uint8Array(await base.clone().jpeg().withExif(exif).toBuffer());

  bannerSource = new Uint8Array(
    await sharp({
      create: {
        width: BANNER_SRC_WIDTH,
        height: BANNER_SRC_HEIGHT,
        channels: 3,
        background: { r: 30, g: 20, b: 10 },
      },
    })
      .png()
      .toBuffer(),
  );
});

describe("resize → variant", () => {
  test("transform resizes to the requested width and outputs webp by default", async () => {
    const out = await adapter.transform(pngSource, { width: VARIANT_WIDTH });
    const info = await adapter.probe(out);

    expect(info.format).toBe("webp");
    expect(info.width).toBe(VARIANT_WIDTH);
    expect(info.width).toBeLessThan(SRC_WIDTH); // actually downscaled
  });

  test("transform never enlarges past the source width", async () => {
    const out = await adapter.transform(pngSource, { width: SRC_WIDTH * 2 });
    const info = await adapter.probe(out);
    expect(info.width).toBe(SRC_WIDTH);
  });
});

describe("privacy — metadata strip", () => {
  test("EXIF present on the source is dropped on transform", async () => {
    // Precondition: the fixture really carries EXIF (else the assertion is vacuous).
    expect((await sharp(jpegWithExif).metadata()).exif).toBeDefined();

    const out = await adapter.transform(jpegWithExif, { width: VARIANT_WIDTH });
    expect((await sharp(out).metadata()).exif).toBeUndefined();
  });

  test("normalize-only (no width) re-encodes and still strips metadata", async () => {
    const out = await adapter.transform(jpegWithExif);
    const info = await adapter.probe(out);
    expect(info.format).toBe("webp");
    expect(info.width).toBe(SRC_WIDTH); // not resized
    expect((await sharp(out).metadata()).exif).toBeUndefined();
  });
});

describe("format normalization", () => {
  test("transform can normalize to png", async () => {
    const out = await adapter.transform(pngSource, { width: VARIANT_WIDTH, format: "png" });
    expect((await adapter.probe(out)).format).toBe("png");
  });
});

// §B.4 — the 2:3 fixed-box smart crop (the portrait variant). Proves against REAL sharp that supplying
// width+height+fit:'cover' produces the EXACT target box (a genuine crop of a differently-shaped source,
// never a stretch), and that the width-only path is unaffected.
describe("portrait crop (width + height + fit:'cover')", () => {
  test("crops a landscape source to the exact 2:3 box (webp)", async () => {
    // pngSource is 400x300 landscape — a naive resize would never yield 200x300; a cover-crop does.
    const out = await adapter.transform(pngSource, {
      width: PORTRAIT_WIDTH,
      height: PORTRAIT_HEIGHT,
      fit: "cover",
      position: "attention",
    });
    const info = await adapter.probe(out);
    expect(info.format).toBe("webp");
    expect(info.width).toBe(PORTRAIT_WIDTH);
    expect(info.height).toBe(PORTRAIT_HEIGHT);
    // The 2:3 ratio is exact (the whole point — a fixed presence box, not a source-aspect resize).
    expect(info.width / info.height).toBeCloseTo(2 / 3, 5);
  });

  test("the width-only path still preserves the source aspect (no crop leak into the icon ladder)", async () => {
    const out = await adapter.transform(pngSource, { width: VARIANT_WIDTH });
    const info = await adapter.probe(out);
    // 400x300 → width 96 preserves 4:3, never forced to 2:3.
    expect(info.width).toBe(VARIANT_WIDTH);
    expect(info.width / info.height).toBeCloseTo(SRC_WIDTH / SRC_HEIGHT, 5);
  });
});

// The banner (3:1) fixed-box smart crop — same proof shape as the portrait block above, against the REAL
// `snapBannerWidth` (width,height) pair rather than a hardcoded ratio literal.
describe("banner crop (width + height + fit:'cover')", () => {
  test("crops a landscape source to the exact 3:1 box (webp)", async () => {
    const expected = snapBannerWidth(BANNER_WIDTHS[0]);
    if (expected === undefined) {
      throw new Error("snapBannerWidth: unreachable for a real BANNER_WIDTHS rung");
    }
    // bannerSource is 960x480 (2:1) — a naive resize would never yield the 480x160 (3:1) box; a
    // cover-crop does.
    const out = await adapter.transform(bannerSource, {
      width: expected.width,
      height: expected.height,
      fit: "cover",
      position: "attention",
    });
    const info = await adapter.probe(out);
    expect(info.format).toBe("webp");
    expect(info.width).toBe(expected.width);
    expect(info.height).toBe(expected.height);
    // The 3:1 ratio is exact — derived from the real policy pair, never a guessed `3` literal.
    expect(info.width / info.height).toBeCloseTo(expected.width / expected.height, 5);
  });
});

describe("rejects non-images", () => {
  const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  test("probe throws on undecodable bytes", async () => {
    await expect(adapter.probe(garbage)).rejects.toThrow();
  });

  test("transform throws on undecodable bytes", async () => {
    await expect(adapter.transform(garbage, { width: VARIANT_WIDTH })).rejects.toThrow();
  });
});
