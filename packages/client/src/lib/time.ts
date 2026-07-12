// THE client date/time seam (UI-Arch §2.1 + §11.5): the wire is ALWAYS epoch-ms UTC; localization
// to the viewer's timezone happens exactly ONCE, at the display edge, through `@orb/kit/time`'s
// display factory (the one sanctioned `Intl` site). Never store or send a formatted date or a tz.
// Tests build their own pinned lib (`createTimeLib({ now, locale, timeZone })` — re-exported from
// the lib front door).
//
// PROBE-MODE `formatRelative` (D2): wall-clock-relative text ("13h ago") churns every minute — the
// single biggest source of false positives in `pnpm snap` diffing. `isProbeMode()` reads localStorage
// (client-only), so the fixed-placeholder swap wraps HERE at the singleton, not inside kit's isomorphic
// factory — every one of the 13 render sites inherits it structurally, no per-site convention.

import type { TimeLib } from "@orb/kit/time";
import { createTimeLib } from "@orb/kit/time";
import { isProbeMode } from "./probe-mode";

const PROBE_RELATIVE_PLACEHOLDER = "some time ago";

const baseTimeLib = createTimeLib();

/** The production instance — browser locale + timezone, real clock (defaulted inside the kit seam);
 *  `formatRelative` freezes to a fixed placeholder under `pnpm snap --probe` (see header). */
export const timeLib: TimeLib = {
  ...baseTimeLib,
  formatRelative: (epochMs): string =>
    isProbeMode() ? PROBE_RELATIVE_PLACEHOLDER : baseTimeLib.formatRelative(epochMs),
};
