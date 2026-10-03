// The client date/time seam: the wire is always epoch-ms UTC; localization happens exactly once, at the
// display edge, through @orb/kit/time's display factory. Never store or send a formatted date. A zone is
// sent only through `viewerTimeZone`, for a clock the server evaluates on the viewer's behalf.
// PROBE-MODE formatRelative: wall-clock-relative text ("13h ago") churns every minute, the single
// biggest source of false positives in snapshot diffing — the fixed-placeholder swap wraps here at the
// singleton so every render site inherits it structurally.

import type { TimeLib } from "@orb/kit/time";
import { createTimeLib, hostTimeZone } from "@orb/kit/time";
import { isProbeMode } from "./probe-mode.ts";

const PROBE_RELATIVE_PLACEHOLDER = "some time ago";
/** The stamp form's frozen twin — a fixed-width plausible stamp, so a probe diff sees the row's real geometry. */
const PROBE_RELATIVE_COMPACT_PLACEHOLDER = "9d";
/** The sentence-ago form's frozen twin — a fixed plausible phrase, so a probe diff of "You left off … in …"
 *  sees the sentence's real geometry without the ago phrase churning every minute. */
const PROBE_RELATIVE_AGO_PLACEHOLDER = "a while ago";

// ONE read of the host zone, at module load: the display factory renders in it and `viewerTimeZone` reports it, so a
// zone the server evaluates for this viewer is the zone their screen shows.
const VIEWER_TIME_ZONE = hostTimeZone();

const baseTimeLib = createTimeLib({ timeZone: VIEWER_TIME_ZONE });

/** The production instance — browser locale + timezone, real clock (defaulted inside the kit seam);
 *  ALL THREE relative forms freeze to a fixed placeholder under `pnpm snap --probe` (see header). */
export const timeLib: TimeLib = {
  ...baseTimeLib,
  formatRelative: (epochMs): string => (isProbeMode() ? PROBE_RELATIVE_PLACEHOLDER : baseTimeLib.formatRelative(epochMs)),
  formatRelativeCompact: (epochMs): string => (isProbeMode() ? PROBE_RELATIVE_COMPACT_PLACEHOLDER : baseTimeLib.formatRelativeCompact(epochMs)),
  formatRelativeAgo: (epochMs): string => (isProbeMode() ? PROBE_RELATIVE_AGO_PLACEHOLDER : baseTimeLib.formatRelativeAgo(epochMs)),
};

/** The viewer's IANA zone — the zone {@link timeLib} renders in. Sent with a request whose server-side
 *  evaluation must run on the viewer's wall clock (an automation rule's `now.hour`, a chat turn's `{{time}}`),
 *  never with a timestamp. */
export function viewerTimeZone(): string {
  return VIEWER_TIME_ZONE;
}
