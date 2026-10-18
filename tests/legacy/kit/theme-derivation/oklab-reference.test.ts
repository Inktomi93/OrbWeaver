// The kit's sRGB <-> OKLCH maths against published OKLab known answers (`tests/support/iso/oklab-reference.ts`).
// Nothing here is computed by the kit, so a transposed coefficient cannot hide behind a round trip.
import { oklchToSrgb, srgbToOklch } from "@orb/kit/theme-derivation";
import { OKLAB_OUT_OF_GAMUT_VECTOR, OKLAB_VECTORS, SRGB_CHANNEL_TOLERANCE } from "@orb/testkit/iso/oklab-reference.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

const SRGB_MAX = 255;
const GAMUT_EDGE_CHANNEL_TOLERANCE = 0.1;
const NEUTRAL_CHROMA_TOLERANCE = 1e-4;
const GREY_STEPS = [0, 1, 8, 40, 64, 99, 128, 180, 220, 254, 255] as const;

// IEC 61966-2-1 sRGB decoding, written out here so the grey expectation does not borrow the kit's.
function decodedSrgbLuminance(channel: number): number {
  const c = channel / SRGB_MAX;
  return c <= 0.040_45 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

test.each(OKLAB_VECTORS.map((vector) => [vector.name, vector] as const))("srgbToOklch reproduces the published OKLCH of %s", (_name, vector) => {
  const got = srgbToOklch(vector.srgb);
  expect(Math.abs(got.l - vector.oklch.l), `L of ${vector.name} (${vector.source})`).toBeLessThanOrEqual(vector.tolerance.l);
  expect(Math.abs(got.c - vector.oklch.c), `chroma of ${vector.name} (${vector.source})`).toBeLessThanOrEqual(vector.tolerance.c);
  const hueError = vector.oklch.c > 0 ? Math.abs(got.h - vector.oklch.h) : 0;
  expect(hueError, `hue of ${vector.name} (${vector.source})`).toBeLessThanOrEqual(vector.tolerance.h);
});

test.each(OKLAB_VECTORS.map((vector) => [vector.name, vector] as const))("oklchToSrgb decodes the published OKLCH of %s to its sRGB", (_name, vector) => {
  const got = oklchToSrgb(vector.oklch);
  for (const channel of ["r", "g", "b"] as const) {
    expect(Math.abs(got[channel] - vector.srgb[channel]), `${channel} of ${vector.name} (${vector.source})`).toBeLessThanOrEqual(SRGB_CHANNEL_TOLERANCE);
  }
});

test("oklchToSrgb clamps an out-of-gamut colour channel by channel at the published unclamped sRGB", () => {
  const { oklch, srgbUnit } = OKLAB_OUT_OF_GAMUT_VECTOR;
  expect(srgbUnit.r, "the vector must actually sit outside the gamut").toBeLessThan(0);
  const got = oklchToSrgb(oklch);
  expect(got.r, "negative red clamps to 0").toBe(0);
  expect(Math.abs(got.g - srgbUnit.g * SRGB_MAX), "green").toBeLessThanOrEqual(GAMUT_EDGE_CHANNEL_TOLERANCE);
  expect(Math.abs(got.b - srgbUnit.b * SRGB_MAX), "blue").toBeLessThanOrEqual(GAMUT_EDGE_CHANNEL_TOLERANCE);
});

// Ottosson's reference puts D65 white at (L, a, b) = (1, 0, 0); the neutral axis has no chroma and its
// lightness is the cube root of the decoded luminance because each row of his LMS matrix sums to one.
// https://bottosson.github.io/posts/oklab/ (the table of example XYZ and Oklab pairs)
test.each(GREY_STEPS)("a neutral grey %i has no chroma and L = cbrt(luminance), in both directions", (step) => {
  const expectedL = Math.cbrt(decodedSrgbLuminance(step));
  const grey = srgbToOklch({ r: step, g: step, b: step });
  expect(grey.l).toBeCloseTo(expectedL, 4);
  expect(grey.c).toBeLessThan(NEUTRAL_CHROMA_TOLERANCE);
  const back = oklchToSrgb({ l: expectedL, c: 0, h: 0 });
  expect([back.r, back.g, back.b]).toEqual([expect.closeTo(step, 1), expect.closeTo(step, 1), expect.closeTo(step, 1)]);
});
