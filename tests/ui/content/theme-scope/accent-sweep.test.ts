// D336: every picked and every inherited accent across a lightness, chroma and hue grid clears every tone's floors and
// tint separations on each contrast-case base.
import { expect, test } from "@orb/testkit/node";
import { BASES } from "./contrast-cases.ts";
import { emittedMisses } from "./tone-scope-misses.ts";

// Each base runs the production clamp twice per accent in the grid; that outruns the default per-test budget.
const SWEEP_TIMEOUT_MS = 180_000;
const ACCENT_LIGHTNESSES = Array.from({ length: 20 }, (_unused, index) => (index + 0.5) / 20);
const ACCENT_CHROMAS = [0, 0.06, 0.12, 0.2, 0.37];
const ACCENT_HUES = Array.from({ length: 8 }, (_unused, index) => index * 45);
const ACCENTS = ACCENT_LIGHTNESSES.flatMap((l) => ACCENT_CHROMAS.flatMap((c) => ACCENT_HUES.map((h) => `oklch(${l} ${c} ${h})`)));

test.for(BASES)(
  "every picked and inherited accent clears every tone's floors and tint separations on the $name contrast-case base",
  { timeout: SWEEP_TIMEOUT_MS },
  ({ background }) => {
    expect(ACCENTS.flatMap((accent) => [...emittedMisses(background, { accent }), ...emittedMisses(background, {}, accent)])).toEqual([]);
  },
);
