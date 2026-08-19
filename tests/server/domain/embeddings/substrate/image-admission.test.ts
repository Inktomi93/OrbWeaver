// substrate/image-admission — the pure image ADMISSION FLOOR. Asserts the min-edge verdict over
// header-parsed dimensions: a degenerate asset (1×1 / a thin sliver / sub-floor) is below-floor; a real
// asset is not; the boundary is exclusive (edge === floor passes); and — load-bearing for the existing
// suite — an asset whose header dimensions are UNPARSEABLE (or not an image at all) is NOT below-floor (the
// floor is a dimension gate, not a decode gate), so those bytes proceed to embed exactly as before.

import { describe } from "vitest";
import { imageBelowFloor, MIN_IMAGE_EDGE_PX } from "../../../../../packages/server/src/domain/embeddings/substrate/image-admission.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const BYTE = 256;
const SHIFT_1 = BYTE;
const SHIFT_2 = 65_536;
const SHIFT_3 = 16_777_216;

/** A 24-byte buffer that `@orb/kit/image-sniff` reads as a PNG of `(width, height)`: the 8-byte signature
 *  then the width/height u32BE fields at offsets 16/20 (the only bytes `sniffImageBytes` parses for PNG).
 *  Composed with arithmetic, not bitwise (the kit-purity house rule the sniffer itself follows). */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set(PNG_SIG, 0);
  const u32be = (n: number, at: number): void => {
    b[at] = Math.floor(n / SHIFT_3) % BYTE;
    b[at + 1] = Math.floor(n / SHIFT_2) % BYTE;
    b[at + 2] = Math.floor(n / SHIFT_1) % BYTE;
    b[at + 3] = n % BYTE;
  };
  u32be(width, 16);
  u32be(height, 20);
  return b;
}

describe("imageBelowFloor", () => {
  test("a 1×1 asset is below the floor (the motivating degenerate case)", () => {
    expect(imageBelowFloor(png(1, 1))).toEqual({ belowFloor: true, width: 1, height: 1 });
  });

  test("a thin sliver is caught by MIN-EDGE, not area (1×1000 is one pixel thin)", () => {
    // Area 1000 would pass an area floor; the shorter edge (1) is what makes it signal-free.
    expect(imageBelowFloor(png(1, 1000))).toEqual({ belowFloor: true, width: 1, height: 1000 });
    expect(imageBelowFloor(png(1000, 1))).toEqual({ belowFloor: true, width: 1000, height: 1 });
  });

  test(`an edge just under the floor (${MIN_IMAGE_EDGE_PX - 1}px) is below`, () => {
    expect(imageBelowFloor(png(MIN_IMAGE_EDGE_PX - 1, 300)).belowFloor).toBe(true);
  });

  test("the boundary is EXCLUSIVE — an edge exactly at the floor passes", () => {
    expect(imageBelowFloor(png(MIN_IMAGE_EDGE_PX, MIN_IMAGE_EDGE_PX)).belowFloor).toBe(false);
  });

  test("a real avatar-sized asset is not below the floor", () => {
    expect(imageBelowFloor(png(64, 64))).toEqual({ belowFloor: false, width: 64, height: 64 });
  });

  test("UNPARSEABLE header dimensions are NOT below-floor (a dimension gate, not a decode gate)", () => {
    // An 8-byte PNG prefix: `sniffImageBytes` recognises the format but cannot read the (absent) IHDR
    // dimensions → width/height null → the asset proceeds to embed. This is the exact shape the existing
    // image suite uses, so the floor leaves every current test's behaviour untouched.
    const truncatedPng = new Uint8Array([...PNG_SIG]);
    expect(imageBelowFloor(truncatedPng)).toEqual({ belowFloor: false, width: null, height: null });
  });

  test("a non-image buffer is NOT below-floor (unknown signature → no dimensions)", () => {
    expect(imageBelowFloor(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual({ belowFloor: false, width: null, height: null });
  });
});
