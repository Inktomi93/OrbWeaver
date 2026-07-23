// backends/kit/image-normalize (MA-6) — the outbound image-input wire-normalize op. A GIF is decoded to a
// first-frame PNG via the INJECTED sharp transform (never stubbed away — the ct-stub-lie lesson: the sniff
// gate + decode + label logic is the real code, only the sharp boundary is faked); every other format
// passes through byte-identically with the historical `image/png` label. The default passthrough op does
// no decode.

import { createImageNormalizer, passthroughImageNormalizer } from "@orb/server/infra/providers/backends/kit";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

// GIF89a magic ("GIF8" + "9a") + a stand-in payload — enough for the pure signature sniff.
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
// GIF87a — the other GIF variant the sniff must also catch.
const GIF87A_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01, 0x00]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
// The fake sharp's first-frame-PNG output (a distinct marker).
const DECODED_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xbe, 0xef]);

describe("createImageNormalizer", () => {
  test("GIF89a → the injected sharp PNG output, labeled image/png; sharp sees the original bytes once", async () => {
    const calls: Uint8Array[] = [];
    const normalize = createImageNormalizer((bytes) => {
      calls.push(bytes);
      return Promise.resolve(DECODED_PNG);
    });
    const out = await normalize(GIF_BYTES);
    expect(out.mediaType).toBe("image/png");
    expect([...out.bytes]).toEqual([...DECODED_PNG]);
    expect(calls).toHaveLength(1);
    expect([...(calls[0] ?? [])]).toEqual([...GIF_BYTES]);
  });

  test("GIF87a is also decoded (both gif variants trip the sniff gate)", async () => {
    const normalize = createImageNormalizer(() => Promise.resolve(DECODED_PNG));
    const out = await normalize(GIF87A_BYTES);
    expect([...out.bytes]).toEqual([...DECODED_PNG]);
  });

  test("PNG passes through byte-identically — sharp is never called", async () => {
    let called = false;
    const normalize = createImageNormalizer(() => {
      called = true;
      return Promise.resolve(DECODED_PNG);
    });
    const out = await normalize(PNG_BYTES);
    expect(out.mediaType).toBe("image/png");
    expect(out.bytes).toBe(PNG_BYTES);
    expect(called).toBe(false);
  });

  test("JPEG passes through byte-identically — sharp is never called", async () => {
    let called = false;
    const normalize = createImageNormalizer(() => {
      called = true;
      return Promise.resolve(DECODED_PNG);
    });
    const out = await normalize(JPEG_BYTES);
    expect(out.bytes).toBe(JPEG_BYTES);
    expect(called).toBe(false);
  });
});

describe("passthroughImageNormalizer", () => {
  test("labels image/png and never decodes — even a GIF passes through untouched", async () => {
    const out = await passthroughImageNormalizer(GIF_BYTES);
    expect(out.mediaType).toBe("image/png");
    expect(out.bytes).toBe(GIF_BYTES);
  });
});
