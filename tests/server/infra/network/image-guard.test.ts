// infra/network/image-guard — isAllowedImageBuffer: the POLICY guard over the pure byte-facts sniff, on
// REMOTE image bytes (hub-browse-design/01 §3, G6). Pins the five typed rejection reasons + the pass path;
// the load-bearing cases are the classic 200-status HTML error page (not-image) and the S4 dimension bomb
// (a tiny valid PNG whose IHDR claims 30000×30000 → dimensions-exceeded, never reaching sharp).

import { ImageRejectedError, isAllowedImageBuffer } from "@orb/server/infra/network";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

// PNG sig + IHDR. Width is the BE u32 at bytes 16-19, height at 20-23. Valid = 100×50.
const PNG_VALID = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x64, 0x00, 0x00, 0x00, 0x32,
]);
// IHDR claims 30000×30000 (0x7530) in a 24-byte buffer — the S4 pixel bomb.
const PNG_BOMB = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x75, 0x30, 0x00, 0x00, 0x75, 0x30,
]);
const GIF_BYTES = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x0a, 0x00, 0x14, 0x00]);

/** Run `fn`, returning the thrown {@link ImageRejectedError}'s reason (or "no-throw") — keeps the reason
 *  assertion OUT of a catch block (noConditionalExpect). */
function reasonOf(fn: () => unknown): string {
  try {
    fn();
    return "no-throw";
  } catch (err) {
    return err instanceof ImageRejectedError ? err.reason : "wrong-error";
  }
}

// biome-ignore lint/security/noSecrets: false positive — the describe label is the function name under test, not a credential (high-entropy heuristic misfire on the long identifier).
describe("isAllowedImageBuffer", () => {
  test("returns the SniffedImage for a valid in-caps PNG", () => {
    expect(isAllowedImageBuffer(PNG_VALID)).toEqual({
      mime: "image/png",
      ext: "png",
      width: 100,
      height: 50,
      animated: false,
    });
  });

  test("a 200-status HTML error page (image/png header lie) is rejected `not-image`", () => {
    const html = new TextEncoder().encode("<!doctype html><title>404</title>");
    expect(reasonOf(() => isAllowedImageBuffer(html))).toBe("not-image");
  });

  test("an over-maxBytes buffer is rejected `too-large`", () => {
    expect(reasonOf(() => isAllowedImageBuffer(PNG_VALID, { maxBytes: 4 }))).toBe("too-large");
  });

  test("a mime outside allowedMime is rejected `mime-not-allowed`", () => {
    expect(
      reasonOf(() => isAllowedImageBuffer(GIF_BYTES, { allowedMime: ["image/png", "image/jpeg"] })),
    ).toBe("mime-not-allowed");
  });

  test("the S4 pixel-bomb (30000×30000 IHDR) is rejected `dimensions-exceeded`", () => {
    expect(reasonOf(() => isAllowedImageBuffer(PNG_BOMB))).toBe("dimensions-exceeded");
  });

  test("null dimensions are rejected by default, admitted with requireDimensions:false", () => {
    // A bare PNG signature (no IHDR) → sniff succeeds but dims are null.
    const headerOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(reasonOf(() => isAllowedImageBuffer(headerOnly))).toBe("dimensions-unknown");
    expect(isAllowedImageBuffer(headerOnly, { requireDimensions: false }).mime).toBe("image/png");
  });
});
