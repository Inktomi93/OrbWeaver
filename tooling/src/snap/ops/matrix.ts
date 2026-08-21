// --matrix: the bounded desktop/mobile × light/dark × motion/reduced grid, one variant per run.
import { basename, extname } from "node:path";
import type { Viewport } from "../../_shared/argv.ts";
import { print, printResult, routeSlug } from "../../_shared/artifacts.ts";
import type { Args } from "../contract/types.ts";
import { variantOut } from "../lib/out-names.ts";
import { DEFAULT_VIEWPORT, MOBILE_DEVICE } from "./flags.ts";
import { snap } from "./run.ts";
import { snapScenario } from "./scenario.ts";

interface MatrixVariant {
  readonly id: string;
  readonly device: string | null;
  readonly viewport: Viewport;
  readonly colorScheme: "light" | "dark";
  readonly reducedMotion: boolean;
}

const MATRIX_VARIANTS: readonly MatrixVariant[] = [
  { id: "desktop-light-motion", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: false },
  { id: "desktop-light-reduced", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: true },
  { id: "desktop-dark-motion", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: false },
  { id: "desktop-dark-reduced", device: null, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: true },
  { id: "mobile-light-motion", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: false },
  { id: "mobile-light-reduced", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "light", reducedMotion: true },
  { id: "mobile-dark-motion", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: false },
  { id: "mobile-dark-reduced", device: MOBILE_DEVICE, viewport: DEFAULT_VIEWPORT, colorScheme: "dark", reducedMotion: true },
];

export async function snapMatrix(opts: Args): Promise<number> {
  const baseName = opts.out ?? (opts.scenario === null ? routeSlug(opts.route) : routeSlug(basename(opts.scenario, extname(opts.scenario))));
  let failures = 0;
  for (const variant of MATRIX_VARIANTS) {
    const runArgs: Args = {
      ...opts,
      matrix: false,
      out: variantOut(baseName, variant.id),
      device: variant.device,
      viewport: variant.viewport,
      colorScheme: variant.colorScheme,
      reducedMotion: variant.reducedMotion,
    };
    print(`\n========== MATRIX ${variant.id} ==========`);
    // biome-ignore lint/performance/noAwaitInLoops: variants are sequential to cap local Chromium/resource pressure.
    const code = runArgs.scenario === null ? await snap(runArgs) : await snapScenario(runArgs);
    failures += Number(code !== 0);
  }
  printResult("snap-matrix", [
    ["variants", MATRIX_VARIANTS.length],
    ["failed", failures],
  ]);
  return failures > 0 ? 1 : 0;
}
