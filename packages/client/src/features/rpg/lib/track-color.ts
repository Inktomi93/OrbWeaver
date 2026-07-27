// The categorical track-ramp color picker (Context-Panel-Program §4.8) — pools/meters are user-defined data
// and need STABLE categorical color by definition order, never color-alone meaning. Maps an ordinal index to
// one of the 6 `--color-track-N` steps (`TrackColor`), wrapping past the ramp. One home so every takeover
// meter/orb colors the same pool the same way.

import type { TrackColor } from "@orb/ui/meter";

const TRACK_RAMP_STEPS = 6;

/** The `--color-track-N` step for the `i`-th categorical datum (0-based), wrapping the 6-step ramp. */
export function trackColor(i: number): TrackColor {
  return ((i % TRACK_RAMP_STEPS) + 1) as TrackColor;
}
