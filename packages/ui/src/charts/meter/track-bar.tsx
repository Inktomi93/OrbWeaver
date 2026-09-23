// TrackBar — a purely DECORATIVE magnitude bar: a 6px rail with a
// track-ramp fill whose WIDTH is `value/max`. It is `aria-hidden` on purpose — the spec's law is
// "the value TEXT is the accessible datum; bars are decorative, never color-alone meaning" (§4.9). The
// consuming BLOCK (meter row, cast card) renders the `label · value/max` text that carries the a11y
// value; this part draws only the tint. That is the deliberate difference from <Meter>, which is
// `role="meter"` (bar-as-datum) — the tracker block kit inverts that per §3.2. Homed in charts/meter/
// (the magnitude-display family; svg-legal data-viz allowlist, §13.7).
import type { ReactElement } from "react";
import { cn, isSafeColor } from "#lib";
import { TRACK_FILL, trackBarVariants } from "./variants.ts";

/** Which `--color-track-N` step fills a bar/ring (categorical, by definition order). */
export type TrackColor = 1 | 2 | 3 | 4 | 5 | 6;

const FULL_PERCENT = 100;

export interface TrackBarProps {
  /** Current magnitude. */
  value: number;
  /** Domain max — the full-bar value. @defaultValue 100 */
  max?: number;
  /** Which `--color-track-N` fills the bar. @defaultValue 1 */
  color?: TrackColor;
  /**
   * Swaps the categorical ramp for a SEMANTIC zone accent — for a bar whose magnitude belongs to a named
   * zone (the preset budget readout's setup/post lanes) rather than to a user-defined pool. Ignored while
   * `danger` bites; `color` is ignored while this is set.
   * @defaultValue "ramp"
   */
  accent?: "ramp" | "info" | "warning";
  /** A host-picked CSS color LITERAL (the free-hex ruling) that overrides the ramp step.
   *  Applied as inline data only when it passes `isSafeColor` (an unsafe value falls back to the ramp);
   *  the fill is aria-hidden decoration, so a non-theme hex is accepted by design. Danger still wins. */
  customColor?: string;
  /** When the value is below this, the fill swaps to the destructive intent (never the sole signal —
   *  the text datum still reads value/max). */
  dangerBelow?: number;
  /**
   * The rail's WIDTH — a variant, because a call-site `w-*` is not the rail's size to state
   * (`ui-size-via-variant`): pre-#146 it resolved by stylesheet order against the opaque custom token,
   * post-#146 it resolves last-wins and silently defeats it. `full` spans the column
   * (the magnitude reading). `swatch` is the fixed LEGEND pill: no magnitude, the bar stands only for
   * its ramp colour beside the thing it names.
   * @defaultValue "full"
   */
  width?: "full" | "swatch";
  className?: string;
}

function clampFraction(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / max));
}

/** The decorative fill bar. `aria-hidden` — pair it with a text `value/max` readout (the datum). */
export function TrackBar({
  value,
  max = FULL_PERCENT,
  color = 1,
  accent = "ramp",
  customColor,
  dangerBelow,
  width = "full",
  className,
}: TrackBarProps): ReactElement {
  const danger = dangerBelow !== undefined && value < dangerBelow;
  const slots = trackBarVariants({ danger, accent, width });
  const fillWidth = `${clampFraction(value, max) * FULL_PERCENT}%`;
  const custom = !danger && customColor !== undefined && isSafeColor(customColor) ? customColor : undefined;
  const ramped = accent === "ramp" && !danger && custom === undefined;
  return (
    <div aria-hidden={true} className={cn(slots.root(), className)} data-slot="track-bar">
      {/* width is data (inline style is the only honest home for a runtime fraction); color is a ramp token
          — or the semantic zone accent, or the host-picked color literal (also data, safe-color-gated). */}
      <div
        className={cn(slots.fill(), ramped ? TRACK_FILL[color] : undefined)}
        data-slot="track-bar-fill"
        style={custom === undefined ? { width: fillWidth } : { width: fillWidth, backgroundColor: custom }}
      />
    </div>
  );
}
