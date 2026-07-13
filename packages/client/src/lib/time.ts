// The client date/time seam: the wire is always epoch-ms UTC; localization happens exactly once, at the
// display edge, through @orb/kit/time's display factory. Never store or send a formatted date or a tz.
// PROBE-MODE formatRelative: wall-clock-relative text ("13h ago") churns every minute, the single
// biggest source of false positives in snapshot diffing — the fixed-placeholder swap wraps here at the
// singleton so every render site inherits it structurally.

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
