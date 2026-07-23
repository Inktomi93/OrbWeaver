// @orb/server/kit/image-matte — the pure corner-flood matte goldens (expressions-design/03 §4.2, 05 §E4):
// a #DDDDDD (221,221,221) surround floods to alpha-0 while the subject pixels stay opaque, and the tolerance
// boundary bites exactly (background ±23 matted, ±25 kept, at the §3.3 default tolerance of 24).

import { describe } from "vitest";
import { floodMatte } from "../../../packages/server/src/kit/image-matte/index.ts";
import { expect, test } from "../../support/fixtures";

const BG = 221; // #DDDDDD
const OPAQUE = 255;
const TOLERANCE = 24;

/** Build a `w×h` RGBA buffer: every pixel `bg` opaque, then paint the given pixels with `[r,g,b]`. */
function image(w: number, h: number, paints: { x: number; y: number; rgb: readonly [number, number, number] }[]): Uint8Array {
  const buf = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    buf.set([BG, BG, BG, OPAQUE], i * 4);
  }
  for (const { x, y, rgb } of paints) {
    buf.set([rgb[0], rgb[1], rgb[2], OPAQUE], (y * w + x) * 4);
  }
  return buf;
}

/** The alpha byte of pixel (x,y). */
function alpha(buf: Uint8Array, w: number, x: number, y: number): number {
  return buf[(y * w + x) * 4 + 3] ?? -1;
}

describe("floodMatte", () => {
  test("floods the contiguous background to alpha-0 and leaves the subject opaque", () => {
    // 4×4: a solid #DDDDDD border ring around a 2×2 red center.
    const red: readonly [number, number, number] = [255, 0, 0];
    const paints = [
      { x: 1, y: 1, rgb: red },
      { x: 2, y: 1, rgb: red },
      { x: 1, y: 2, rgb: red },
      { x: 2, y: 2, rgb: red },
    ];
    const out = floodMatte(image(4, 4, paints), { width: 4, height: 4, tolerance: TOLERANCE });
    // Corners + border ring → transparent.
    expect(alpha(out, 4, 0, 0)).toBe(0);
    expect(alpha(out, 4, 3, 0)).toBe(0);
    expect(alpha(out, 4, 0, 3)).toBe(0);
    // Subject → untouched.
    expect(alpha(out, 4, 1, 1)).toBe(OPAQUE);
    expect(alpha(out, 4, 2, 2)).toBe(OPAQUE);
  });

  test("does not mutate the input buffer (returns a fresh matte)", () => {
    const input = image(2, 2, []);
    const out = floodMatte(input, { width: 2, height: 2, tolerance: TOLERANCE });
    expect(input[3]).toBe(OPAQUE); // input corner alpha preserved
    expect(out[3]).toBe(0); // output corner matted
  });

  test("tolerance boundary: background ±23 mattes, ±25 is kept (tolerance 24)", () => {
    // A center pixel 23 off the corner color is within tolerance → still flooded (contiguous, matted).
    const near = floodMatte(image(3, 1, [{ x: 1, y: 0, rgb: [BG + 23, BG + 23, BG + 23] }]), { width: 3, height: 1, tolerance: TOLERANCE });
    expect(alpha(near, 3, 1, 0)).toBe(0);
    // A center pixel 25 off is outside tolerance → kept opaque, and it blocks the flood past it.
    const far = floodMatte(image(3, 1, [{ x: 1, y: 0, rgb: [BG + 25, BG + 25, BG + 25] }]), { width: 3, height: 1, tolerance: TOLERANCE });
    expect(alpha(far, 3, 1, 0)).toBe(OPAQUE);
  });
});
