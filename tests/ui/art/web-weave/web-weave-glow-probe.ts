import { z } from "zod";

export const captureFacts = z.strictObject({
  warmComposites: z.number(),
  frames: z.number(),
  referenceMass: z.number(),
  relativeAlphaError: z.number(),
  alphaRatio: z.number(),
  coldAfterPressure: z.number(),
  warmAfterPressure: z.number(),
  channels: z.array(z.number()),
});

/** Compare native raster alpha and colour with the established round-cap reference. */
export function capturePixelFacts(
  actual: Uint8ClampedArray,
  reference: Uint8ClampedArray,
  half: Uint8ClampedArray,
): Pick<z.infer<typeof captureFacts>, "referenceMass" | "relativeAlphaError" | "alphaRatio" | "channels"> {
  let mass = 0;
  let error = 0;
  for (let i = 3; i < actual.length; i += 4) {
    mass += reference[i] ?? 0;
    error += Math.abs((actual[i] ?? 0) - (reference[i] ?? 0));
  }
  const alphaMass = (pixels: Uint8ClampedArray): number => pixels.reduce((sum, value, index) => sum + (index % 4 === 3 ? value : 0), 0);
  const channels = [0, 1, 2].map((channel) =>
    actual.reduce((sum, value, index) => sum + (index % 4 === channel ? value * (actual[index - channel + 3] ?? 0) : 0), 0),
  );
  return { referenceMass: mass, relativeAlphaError: error / mass, alphaRatio: alphaMass(half) / alphaMass(actual), channels };
}
