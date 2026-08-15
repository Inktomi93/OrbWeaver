// The categorical track-ramp color picker — trackers are user-defined data and need STABLE categorical
// color by definition order, never color-alone meaning. Maps an ordinal index to one of the 6
// `--color-track-N` steps (`TrackColor`), wrapping past the ramp. One home so every takeover meter/orb
// colors the same tracker the same way.
//
// The owner free-hex ruling: `resolveTrackerColor` is the ONE `def.color ?? trackColor(ordinal)`
// derivation feeding the GM swatch, the band orb, and every bar. A stored color must pass the strict
// hex/OKLCH grammar (`RPG_TRACKER_COLOR_RE`); anything else heals to the ordinal ramp (a non-color string
// never reaches a style attribute).

import { RPG_TRACKER_COLOR_RE } from "@orb/contracts/rpg";
import type { TrackColor } from "@orb/ui/meter";

const TRACK_RAMP_STEPS = 6;

/** The `--color-track-N` step for the `i`-th categorical datum (0-based), wrapping the 6-step ramp.
 *  Module-private: every consumer goes through `resolveTrackerColor` (the ONE `def.color ?? ramp` seam), so a
 *  caller can never pick a raw ramp step and bypass a host-picked color. */
function trackColor(i: number): TrackColor {
  return ((i % TRACK_RAMP_STEPS) + 1) as TrackColor;
}

/** A ramp-step resolution — the ordinal `trackColor(i)` derivation (the default, theme-tracking). */
interface RampTrackColor {
  readonly kind: "ramp";
  readonly step: TrackColor;
}
/** A host-picked color LITERAL resolution (free hex — theme-static by accepted design; the value text
 *  stays tokened). */
interface CustomTrackColor {
  readonly kind: "custom";
  readonly css: string;
}
/** The resolved display color for a bar/orb/slice. LOCAL (not exported): no consumer outside this module
 *  names it — the `@orb/ui` bars take a `customColor: string`, and the feature callers spread
 *  `trackColorProps(...)`'s inferred result. Homing it in a feature-lib would trip `no-inline-types`
 *  (the type-HOME rule); keeping it local is the correct placement. */
type ResolvedTrackColor = RampTrackColor | CustomTrackColor;

/** THE `def.color ?? trackColor(ordinal)` resolution — one home for every consumer. A stored
 *  color that fails the strict grammar (impossible via the write gate, defensive at the read seam) heals
 *  to the ordinal ramp, never a raw style value. */
export function resolveTrackerColor(color: string | null | undefined, ordinal: number): ResolvedTrackColor {
  if (color !== null && color !== undefined && RPG_TRACKER_COLOR_RE.test(color)) {
    return { kind: "custom", css: color };
  }
  return { kind: "ramp", step: trackColor(ordinal) };
}

/** Spread-ready props for `TrackBar`/`RingGauge` from a resolved color (`color` XOR `customColor`). */
export function trackColorProps(resolved: ResolvedTrackColor): { readonly color: TrackColor } | { readonly color: TrackColor; readonly customColor: string } {
  if (resolved.kind === "custom") {
    // The ramp step under a custom color is inert (customColor wins) — 1 keeps the prop total.
    return { color: 1, customColor: resolved.css };
  }
  return { color: resolved.step };
}
