// The client date/time seam: the wire is always epoch-ms UTC; localization happens exactly once, at the
// display edge, through @orb/kit/time's display factory. Never store or send a formatted date or a tz.
// PROBE-MODE formatRelative: wall-clock-relative text ("13h ago") churns every minute, the single
// biggest source of false positives in snapshot diffing — the fixed-placeholder swap wraps here at the
// singleton so every render site inherits it structurally.

import type { TimeLib } from "@orb/kit/time";
import { createTimeLib } from "@orb/kit/time";
import { isProbeMode } from "./probe-mode.ts";

const PROBE_RELATIVE_PLACEHOLDER = "some time ago";
/** The stamp form's frozen twin — a fixed-width plausible stamp, so a probe diff sees the row's real geometry. */
const PROBE_RELATIVE_COMPACT_PLACEHOLDER = "9d";

const baseTimeLib = createTimeLib();

/** The production instance — browser locale + timezone, real clock (defaulted inside the kit seam);
 *  BOTH relative forms freeze to a fixed placeholder under `pnpm snap --probe` (see header). */
export const timeLib: TimeLib = {
  ...baseTimeLib,
  formatRelative: (epochMs): string => (isProbeMode() ? PROBE_RELATIVE_PLACEHOLDER : baseTimeLib.formatRelative(epochMs)),
  formatRelativeCompact: (epochMs): string => (isProbeMode() ? PROBE_RELATIVE_COMPACT_PLACEHOLDER : baseTimeLib.formatRelativeCompact(epochMs)),
};
