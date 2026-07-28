// The categorical track-ramp color picker (Context-Panel-Program §4.8) — pools/meters are user-defined data
// and need STABLE categorical color by definition order, never color-alone meaning. Maps an ordinal index to
// one of the 6 `--color-track-N` steps (`TrackColor`), wrapping past the ramp. One home so every takeover
// meter/orb colors the same pool the same way.
//
// Panel-redesign additions (DESIGN.md §12.1.2 + the owner free-hex ruling): `resolvePoolColor` is the ONE
// `def.color ?? trackColor(ordinal)` derivation feeding GM swatch, orb, bar, and budget slice; and
// `resolveAccentColor` is the `rpg_hud_widgets.accent` WARD — a stored accent must pass the same strict
// hex/OKLCH grammar the pool color rides (`RPG_POOL_COLOR_RE`); anything else heals to null → the ordinal
// ramp (a non-color accent string never reaches a style attribute).

import { RPG_POOL_COLOR_RE } from "@orb/contracts/rpg";
import type { TrackColor } from "@orb/ui/meter";

const TRACK_RAMP_STEPS = 6;

/** The `--color-track-N` step for the `i`-th categorical datum (0-based), wrapping the 6-step ramp. */
export function trackColor(i: number): TrackColor {
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

/** THE `def.color ?? trackColor(ordinal)` resolution (§12.1.2) — one home for every consumer. A stored
 *  color that fails the strict grammar (impossible via the write gate, defensive at the read seam) heals
 *  to the ordinal ramp, never a raw style value. */
export function resolvePoolColor(color: string | null | undefined, ordinal: number): ResolvedTrackColor {
  if (color !== null && color !== undefined && RPG_POOL_COLOR_RE.test(color)) {
    return { kind: "custom", css: color };
  }
  return { kind: "ramp", step: trackColor(ordinal) };
}

/** The widget-accent ward (§12.1.2): `rpg_hud_widgets.accent` accepts the SAME validated hex/OKLCH
 *  vocabulary; a non-color accent heals to the ordinal ramp. */
export function resolveAccentColor(accent: string | null, ordinal: number): ResolvedTrackColor {
  return resolvePoolColor(accent, ordinal);
}

/** Spread-ready props for `TrackBar`/`RingGauge` from a resolved color (`color` XOR `customColor`). */
export function trackColorProps(resolved: ResolvedTrackColor): { readonly color: TrackColor } | { readonly color: TrackColor; readonly customColor: string } {
  if (resolved.kind === "custom") {
    // The ramp step under a custom color is inert (customColor wins) — 1 keeps the prop total.
    return { color: 1, customColor: resolved.css };
  }
  return { color: resolved.step };
}
