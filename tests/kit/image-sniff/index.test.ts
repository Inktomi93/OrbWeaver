// kit/image-sniff — sniffMime / isAnimated / sniffImageBytes: the pure magic-byte + dimension + animation
// sniff shared by the assets domain, the infra/network image-guard, and the vllm backend (PD-123 + D61 B5a
// G2). Pins each recognized signature + the octet-stream sentinel for unknown/short input (the upload
// boundary's "never a valid claimed mime"), the animation-chunk sniff (GIF/APNG/WebP), and the header-parsed
// dimensions per format.

import { isAnimated, sniffImageBytes, sniffMime } from "@orb/kit/image-sniff";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01]);
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01]);
// RIFF....WEBP — bytes 4..7 (the chunk size) are irrelevant to the sniff.
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe("sniffMime", () => {
  test("recognizes PNG / JPEG / GIF87a / GIF89a / WebP signatures", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(GIF87)).toBe("image/gif");
    expect(sniffMime(GIF89)).toBe("image/gif");
    expect(sniffMime(WEBP)).toBe("image/webp");
  });

  test("unknown bytes are the octet-stream sentinel", () => {
    expect(sniffMime(new TextEncoder().encode("plain text, not an image"))).toBe("application/octet-stream");
  });

  test("a buffer too short for a signature does not false-match", () => {
    // A bare 4-byte "GIF8" (or "RIFF") is NOT a valid image — strict tables require the full tag.
    expect(sniffMime(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array([]))).toBe("application/octet-stream");
  });
});

// ── Fixtures: hand-built minimal headers (dimensions chosen distinct so a swapped W/H fails loudly) ──────

// PNG IHDR: sig(8) + length(4) + "IHDR"(4) + width(4 BE) + height(4 BE). 100×50.
const PNG_STATIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32,
]);
// The same PNG head with an `acTL` (APNG animation-control) chunk following IHDR → animated.
const APNG_STATIC = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32, 0x00, 0x00,
  0x00, 0x08, 0x61, 0x63, 0x54, 0x4c,
]);
// GIF89a: "GIF89a"(6) + width(2 LE) + height(2 LE). 10×20.
const GIF_ANIM = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00, 0x14, 0x00]);
// WebP VP8X (extended, animated): RIFF..WEBP + "VP8X" + chunkSize(4) + flags(1, anim bit 0x02) +
// reserved(3) + canvasW-1(3 LE) + canvasH-1(3 LE). 300×200. 299=0x00012b, 199=0x0000c7.
const WEBP_VP8X_ANIM = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x2b, 0x01,
  0x00, 0xc7, 0x00, 0x00,
]);
// JPEG with an APP0 segment before SOF0 (exercises the marker skip). 80×40.
const JPEG_APP0 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x28, 0x00, 0x50]);
// AVIF: ftyp(avif brand) + an ispe box (version/flags + width 1024 BE + height 768 BE).
const AVIF_STILL = new Uint8Array([
  0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x14, 0x69, 0x73, 0x70, 0x65, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x03, 0x00,
]);

describe("isAnimated", () => {
  test("every GIF is treated animated; a static PNG/JPEG is not", () => {
    expect(isAnimated(GIF_ANIM)).toBe(true);
    expect(isAnimated(PNG_STATIC)).toBe(false);
    expect(isAnimated(JPEG_APP0)).toBe(false);
  });

  test("APNG (acTL) and animated WebP (VP8X anim flag) are animated", () => {
    expect(isAnimated(APNG_STATIC)).toBe(true);
    expect(isAnimated(WEBP_VP8X_ANIM)).toBe(true);
  });

  test("garbage / truncated buffers are not animated", () => {
    expect(isAnimated(new Uint8Array([]))).toBe(false);
    expect(isAnimated(new TextEncoder().encode("not an image"))).toBe(false);
  });
});

describe("sniffImageBytes", () => {
  test("parses PNG signature + dimensions", () => {
    expect(sniffImageBytes(PNG_STATIC)).toEqual({
      mime: "image/png",
      ext: "png",
      width: 100,
      height: 50,
      animated: false,
    });
  });

  test("parses GIF dimensions (little-endian) and marks it animated", () => {
    expect(sniffImageBytes(GIF_ANIM)).toEqual({
      mime: "image/gif",
      ext: "gif",
      width: 10,
      height: 20,
      animated: true,
    });
  });

  test("parses a WebP VP8X canvas size + animation flag", () => {
    expect(sniffImageBytes(WEBP_VP8X_ANIM)).toEqual({
      mime: "image/webp",
      ext: "webp",
      width: 300,
      height: 200,
      animated: true,
    });
  });

  test("parses a JPEG SOF past an APP0 segment", () => {
    expect(sniffImageBytes(JPEG_APP0)).toEqual({
      mime: "image/jpeg",
      ext: "jpg",
      width: 80,
      height: 40,
      animated: false,
    });
  });

  test("parses an AVIF ispe box", () => {
    expect(sniffImageBytes(AVIF_STILL)).toEqual({
      mime: "image/avif",
      ext: "avif",
      width: 1024,
      height: 768,
      animated: false,
    });
  });

  test("null dimensions when the header is truncated past the signature", () => {
    const truncatedPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(sniffImageBytes(truncatedPng)).toEqual({
      mime: "image/png",
      ext: "png",
      width: null,
      height: null,
      animated: false,
    });
  });

  test("non-image bytes sniff to null", () => {
    expect(sniffImageBytes(new TextEncoder().encode("plain text"))).toBeNull();
    expect(sniffImageBytes(new Uint8Array([]))).toBeNull();
  });
});
