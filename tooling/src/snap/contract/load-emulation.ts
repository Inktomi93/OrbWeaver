// The LOAD-EMULATION vocabulary: what `--network` and `--cpu-throttle` ask the browser for, and the two
// wall-clock ceilings the resulting drive is judged against. Its own contract module rather than ./types.ts
// because that door sits at the tooling-size cap and this is a self-contained family with one resolver
// (lib/throttle.ts) and one applier (ops/session.ts `applyLoadEmulation`) — the split #1198 and #1231 both
// already made for the overflow shapes, applied to the next family out.

/** The `--network` vocabulary: Chrome DevTools' OWN predefined conditions, by their current DevTools
 *  names (`front_end/core/sdk/NetworkManager.ts`). "Fast 3G" is DevTools' retired name for "Slow 4G" and
 *  is accepted as an alias by the parser, never as a distinct profile — two spellings, one condition. The
 *  numbers live with the resolver in lib/throttle.ts. */
const NETWORK_PROFILE_NAMES = ["fast-4g", "offline", "slow-3g", "slow-4g"] as const;
export type NetworkProfileName = (typeof NETWORK_PROFILE_NAMES)[number];

/** One CDP `Network.emulateNetworkConditions` payload. */
export interface NetworkConditions {
  readonly offline: boolean;
  /** Bytes/second; -1 disables the limit (CDP's own sentinel). */
  readonly downloadThroughput: number;
  readonly uploadThroughput: number;
  /** Additional minimum latency, ms. */
  readonly latency: number;
}

/** The two wall-clock ceilings one drive is judged against (#836). They are a function of what the run is
 *  serving (a cold `--isolated` vite) AND of the load arm it declared: a `--network`/`--cpu-throttle` run
 *  is deliberately slower, so holding it to the un-throttled budget refuses the flag it was asked for.
 *  Resolved by `driveBudgets` in lib/throttle.ts. */
export interface DriveBudgets {
  /** `page.goto` ceiling. */
  readonly nav: number;
  /** `data-app-ready` ceiling — the one that decides whether a capture is of the SETTLED app. */
  readonly ready: number;
}

/** The `--vision` vocabulary: CDP `Emulation.setEmulatedVisionDeficiency`'s own `type` values, minus
 *  `none` (the absent flag). Chromium renders the page through the filter, so screenshots and pixel
 *  contrast reads see what that viewer sees; DOM and computed-style reads do not change. */
export const VISION_DEFICIENCIES = ["blurredVision", "reducedContrast", "achromatopsia", "deuteranopia", "protanopia", "tritanopia"] as const;
export type VisionDeficiency = (typeof VISION_DEFICIENCIES)[number];
