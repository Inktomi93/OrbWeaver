// infra/image — the sharp adapter against real sharp encode/decode (integration lane). Pins resize→variant,
// the privacy metadata-strip (EXIF dropped on transform), format normalization, and non-image rejection.

import { createImageAdapter } from "@orb/server/infra/image";
import sharp from "sharp";
import { beforeAll, describe, expect, test } from "vitest";

const SRC_WIDTH = 400;
const SRC_HEIGHT = 300;
const VARIANT_WIDTH = 96;

const adapter = createImageAdapter();

// A small solid PNG fixture (no metadata) + a JPEG fixture carrying EXIF (the privacy case).
let pngSource: Uint8Array;
let jpegWithExif: Uint8Array;

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

describe("rejects non-images", () => {
  const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

  test("probe throws on undecodable bytes", async () => {
    await expect(adapter.probe(garbage)).rejects.toThrow();
  });

  test("transform throws on undecodable bytes", async () => {
    await expect(adapter.transform(garbage, { width: VARIANT_WIDTH })).rejects.toThrow();
  });
});
