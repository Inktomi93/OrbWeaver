// RingGauge — a DECORATIVE ring gauge (the OSRS pool-orb idiom): a full
// circle whose filled arc = `value/max`, the value glyph inside, an optional label + `value/max`
// readout below. The `<svg>` is `aria-hidden`; the accessible datum is a visually-hidden
// `label value/max` line (§4.9 — "orbs carry visually-hidden `label value/max`"; bars/rings are never
// the color-alone signal). A ring GAUGE (arc = value/max), never a bare circled number — v1's circled
// counts read as notification badges (§4.5). Homed in charts/meter/ (the magnitude-display family;
// inline data-viz svg is legal only in charts/**, §13.7 — the sibling of <Meter kind="arc">).
import type { ReactElement } from "react";
import { cn, isSafeColor } from "#lib";
import type { TrackColor } from "./track-bar.tsx";
import { RING_STROKE, ringGaugeVariants } from "./variants.ts";

/** RingGauge shares the track-ramp step vocabulary with TrackBar. */
export type RingColor = TrackColor;

const FULL_PERCENT = 100;

// SVG geometry (viewBox units — named per biome noMagicNumbers; mirrors the mockup orb).
const SIZE = 32;
const STROKE = 3.4;
const CENTER = SIZE / 2;
const RADIUS = 11.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TEXT_BASELINE_Y = 19.5;

export interface RingGaugeProps {
  /** Current magnitude. */
  value: number;
  /** Domain max — the full-ring value. @defaultValue 100 */
  max?: number;
  /** Which `--color-track-N` strokes the arc. @defaultValue 1 */
  color?: RingColor;
  /** Accessible name — the pool/meter label ("Health"). Rendered as the visually-hidden datum + the
   *  optional visible caption. */
  label: string;
  /** Show the visible label + `value/max` caption below the ring. @defaultValue false */
  showCaption?: boolean;
  /** Short caption label when `showCaption` (the compact orb tag, e.g. "HP"); falls back to `label`. */
  captionLabel?: string;
  /** A host-picked CSS color LITERAL (the free-hex ruling) that overrides the ramp step.
   *  Applied as inline data only when it passes `isSafeColor` (unsafe ⇒ ramp fallback); the arc is
   *  aria-hidden decoration, so a non-theme hex is accepted by design. Danger still wins. */
  customColor?: string;
  /** Below-value it swaps to the destructive intent (never the sole signal — the datum still reads). */
  dangerBelow?: number;
  className?: string;
}

function clampFraction(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, value / max));
}

/** The decorative ring gauge + its visually-hidden datum. */
export function RingGauge({
  value,
  max = FULL_PERCENT,
  color = 1,
  label,
  showCaption = false,
  captionLabel,
  customColor,
  dangerBelow,
  className,
}: RingGaugeProps): ReactElement {
  const danger = dangerBelow !== undefined && value < dangerBelow;
  const slots = ringGaugeVariants();
  const filled = clampFraction(value, max) * CIRCUMFERENCE;
  const rotate = `rotate(-90 ${CENTER} ${CENTER})`;
  // The host-picked color literal rides `currentColor` via an inline style (data, safe-color-gated).
  const custom = !danger && customColor !== undefined && isSafeColor(customColor) ? customColor : undefined;
  const fillClass = custom === undefined ? RING_STROKE[color] : undefined;

  return (
    <div className={cn(slots.root(), className)} data-slot="ring-gauge">
      {/* aria-hidden: the ring is decoration; the datum is the sr-only line below. */}
      <svg aria-hidden={true} className={slots.svg()} data-slot="ring-gauge-svg" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        {/* The empty track carries its own slot so the #693 contrast pin has an anchor that resolves
            UNIQUELY (a `circle:not([data-slot])` sweep would also match a defs circle in a sibling part). */}
        <circle
          className={slots.track()}
          cx={CENTER}
          cy={CENTER}
          data-slot="ring-gauge-track"
          fill="none"
          r={RADIUS}
          stroke="currentColor"
          strokeWidth={STROKE}
        />
        <circle
          className={danger ? "text-destructive" : fillClass}
          cx={CENTER}
          cy={CENTER}
          data-slot="ring-gauge-fill"
          fill="none"
          r={RADIUS}
          stroke="currentColor"
          {...(custom === undefined ? {} : { style: { color: custom } })}
          strokeDasharray={`${filled} ${CIRCUMFERENCE}`}
          strokeLinecap="round"
          strokeWidth={STROKE}
          transform={rotate}
        />
        <text className={slots.valueText()} textAnchor="middle" x={CENTER} y={TEXT_BASELINE_Y}>
          {value}
        </text>
      </svg>
      {showCaption ? (
        <>
          <span aria-hidden={true} className={slots.label()} data-slot="ring-gauge-label">
            {captionLabel ?? label}
          </span>
          <span aria-hidden={true} className={slots.readout()} data-slot="ring-gauge-readout">
            {value}/{max}
          </span>
        </>
      ) : null}
      <span className="sr-only">{`${label} ${value}/${max}`}</span>
    </div>
  );
}
