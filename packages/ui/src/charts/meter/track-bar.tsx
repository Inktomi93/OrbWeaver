// TrackBar — a purely DECORATIVE magnitude bar (Context-Panel-Program §3.2 / §4.9): a 6px rail with a
// track-ramp fill whose WIDTH is `value/max`. It is `aria-hidden` on purpose — the spec's law is
// "the value TEXT is the accessible datum; bars are decorative, never color-alone meaning" (§4.9). The
// consuming BLOCK (meter row, cast card) renders the `label · value/max` text that carries the a11y
// value; this part draws only the tint. That is the deliberate difference from <Meter>, which is
// `role="meter"` (bar-as-datum) — the tracker block kit inverts that per §3.2. Homed in charts/meter/
// (the magnitude-display family; svg-legal data-viz allowlist, §13.7).
import type { ReactElement } from "react";
import { cn, isSafeColor } from "#lib";
import { TRACK_FILL, trackBarVariants } from "./variants";

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
  /** A host-picked CSS color LITERAL (the panel-redesign free-hex ruling) that overrides the ramp step.
   *  Applied as inline data only when it passes `isSafeColor` (an unsafe value falls back to the ramp);
   *  the fill is aria-hidden decoration, so a non-theme hex is accepted by design. Danger still wins. */
  customColor?: string;
  /** When the value is below this, the fill swaps to the destructive intent (never the sole signal —
   *  the text datum still reads value/max). */
  dangerBelow?: number;
  className?: string;
}

function clampFraction(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / max));
}

/** The decorative fill bar. `aria-hidden` — pair it with a text `value/max` readout (the datum). */
export function TrackBar({ value, max = FULL_PERCENT, color = 1, customColor, dangerBelow, className }: TrackBarProps): ReactElement {
  const danger = dangerBelow !== undefined && value < dangerBelow;
  const slots = trackBarVariants({ danger });
  const width = `${clampFraction(value, max) * FULL_PERCENT}%`;
  const custom = !danger && customColor !== undefined && isSafeColor(customColor) ? customColor : undefined;
  return (
    <div aria-hidden={true} className={cn(slots.root(), className)} data-slot="track-bar">
      {/* width is data (inline style is the only honest home for a runtime fraction); color is a ramp token
          — or the host-picked color literal (also data, safe-color-gated). */}
      <div
        className={cn(slots.fill(), danger || custom !== undefined ? undefined : TRACK_FILL[color])}
        data-slot="track-bar-fill"
        style={custom === undefined ? { width } : { width, backgroundColor: custom }}
      />
    </div>
  );
}
