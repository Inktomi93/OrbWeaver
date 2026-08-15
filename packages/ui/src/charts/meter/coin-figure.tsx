// CoinFigure — the HONEST wallet disc: a max-less QUANTITY must never
// wear an arc (a gauge shape over an unbounded number is a lie of shape), so the wallet renders as a COIN —
// a filled disc with the amount inside, label + amount text beneath. The ONE new sibling in the RingGauge
// orb family (charts/meter — svg-legal data-viz, §13.7). Same a11y model as its siblings: the `<svg>` is
// `aria-hidden` decoration; the accessible datum is the visually-hidden `label amount` line (+ the optional
// visible caption). Coin tint rides the track ramp (default the gold step 3) via `color-mix` over tokens.
import type { ReactElement } from "react";
import { cn } from "#lib";
import type { TrackColor } from "./track-bar.tsx";
import { COIN_DISC_FILL, COIN_DISC_RING, COIN_DISC_STROKE, ringGaugeVariants } from "./variants.ts";

export interface CoinFigureProps {
  /** The amount shown inside the disc (a max-less quantity — never a fraction). */
  amount: number;
  /** Accessible name — the currency label ("gold"). */
  label: string;
  /** Which `--color-track-N` tints the coin. @defaultValue 3 (the gold step) */
  color?: TrackColor;
  /** Show the visible label + amount caption below the disc. @defaultValue false */
  showCaption?: boolean;
  className?: string;
}

// SVG geometry (viewBox units — mirrors the mock coin; named per biome noMagicNumbers).
const SIZE = 32;
const CENTER = SIZE / 2;
const DISC_R = 13;
const INNER_R = 9.5;
const DISC_STROKE_W = 2;
const TEXT_BASELINE_Y = 19.5;
/** Amounts at/above 10k compress to `Nk` so the disc's glyph never overflows the coin face. */
const COMPACT_FROM = 10_000;
const THOUSAND = 1000;

/** Compact display for large hoards — the exact amount stays in the sr-only datum + the caption. */
function coinGlyph(amount: number): string {
  if (Math.abs(amount) >= COMPACT_FROM) {
    return `${Math.trunc(amount / THOUSAND)}k`;
  }
  return String(amount);
}

/** The decorative coin disc + its visually-hidden datum. */
export function CoinFigure({ amount, label, color = 3, showCaption = false, className }: CoinFigureProps): ReactElement {
  // Shares the orb column skin (label/readout/value slots) with RingGauge — one satellite anatomy.
  const slots = ringGaugeVariants();
  return (
    <div className={cn(slots.root(), className)} data-slot="coin-figure">
      <svg aria-hidden={true} className={slots.svg()} data-slot="coin-figure-svg" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={CENTER} cy={CENTER} r={DISC_R} fill={COIN_DISC_FILL[color]} stroke={COIN_DISC_STROKE[color]} strokeWidth={DISC_STROKE_W} />
        <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="none" stroke={COIN_DISC_RING[color]} strokeWidth="1" />
        <text className={slots.valueText()} textAnchor="middle" x={CENTER} y={TEXT_BASELINE_Y}>
          {coinGlyph(amount)}
        </text>
      </svg>
      {showCaption ? (
        <>
          <span aria-hidden={true} className={slots.label()} data-slot="coin-figure-label">
            {label}
          </span>
          <span aria-hidden={true} className={slots.readout()} data-slot="coin-figure-readout">
            {amount}
          </span>
        </>
      ) : null}
      <span className="sr-only">{`${label} ${amount}`}</span>
    </div>
  );
}
