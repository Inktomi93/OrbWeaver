// substrate: sniffMime — the magic-byte sniff (esoterica #7). Pins each recognized signature + the
// octet-stream sentinel for unknown/short input (the upload boundary's "never a valid claimed mime").

import { describe, expect, test } from "vitest";
import { sniffMime } from "../../../../../packages/server/src/domain/assets/substrate/mime.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GIF87 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0x01]);
const GIF89 = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01]);
// RIFF....WEBP — bytes 4..7 (the chunk size) are irrelevant to the sniff.
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]);

describe("sniffMime", () => {
  test("recognizes PNG / JPEG / GIF87a / GIF89a / WebP signatures", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(JPEG)).toBe("image/jpeg");
    expect(sniffMime(GIF87)).toBe("image/gif");
    expect(sniffMime(GIF89)).toBe("image/gif");
    expect(sniffMime(WEBP)).toBe("image/webp");
  });

  test("unknown bytes are the octet-stream sentinel", () => {
    expect(sniffMime(new TextEncoder().encode("plain text, not an image"))).toBe(
      "application/octet-stream",
    );
  });

  test("a buffer too short for a signature does not false-match", () => {
    // RIFF prefix without the WEBP tag must NOT be sniffed as webp.
    expect(sniffMime(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe("application/octet-stream");
    expect(sniffMime(new Uint8Array([]))).toBe("application/octet-stream");
  });
});
