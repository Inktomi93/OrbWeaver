// CoinFigure — the HONEST wallet disc: a max-less QUANTITY must never
// wear an arc (a gauge shape over an unbounded number is a lie of shape), so the wallet renders as a COIN —
// a filled disc with the amount inside and the LABEL beneath. The ONE new sibling in the RingGauge
// orb family (charts/meter — svg-legal data-viz, §13.7). Same a11y model as its siblings: the `<svg>` is
// `aria-hidden` decoration; the accessible datum is the visually-hidden `label amount` line (+ the optional
// visible caption). Coin tint rides the track ramp (default the gold step 3) via `color-mix` over tokens.
//
// TWO CORRECTIONS FROM THE 2026-08-16 CONSISTENCY PASS (#99), both stated so neither reads as drift:
//   · The caption no longer restates the amount. It used to print `label` + `amount` beneath a disc whose own
//     glyph IS that amount — one value, twice, ~30px apart, and one of the four simultaneous spellings of
//     "silver crowns" the audit measured in a 384px panel. The readout returns ONLY when `coinGlyph` compacts
//     (`12k`), where the exact figure has nowhere else visible to live. RingGauge is untouched: its readout
//     carries `value/max`, which its arc genuinely cannot state.
//   · A non-positive amount takes `COIN_DISC_EMPTY` — the same anatomy off the muted foreground instead of a
//     track step. An empty (or negative) purse rendered in ramp gold was a null state wearing a prize's
//     clothes; the FIGURE stays, only its mood is honest.
import type { ReactElement } from "react";
import { cn } from "#lib";
import type { TrackColor } from "./track-bar.tsx";
import { COIN_DISC_EMPTY, COIN_DISC_FILL, COIN_DISC_RING, COIN_DISC_STROKE, ringGaugeVariants } from "./variants.ts";

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
  // A purse at zero or in the red is NOT a hoard (#99 item 6): it sheds the ramp tint for the neutral trio.
  const empty = amount <= 0;
  const disc = empty ? COIN_DISC_EMPTY : { fill: COIN_DISC_FILL[color], stroke: COIN_DISC_STROKE[color], ring: COIN_DISC_RING[color] };
  return (
    <div className={cn(slots.root(), className)} data-slot="coin-figure" data-empty={empty}>
      <svg aria-hidden={true} className={slots.svg()} data-slot="coin-figure-svg" viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={CENTER} cy={CENTER} r={DISC_R} fill={disc.fill} stroke={disc.stroke} strokeWidth={DISC_STROKE_W} />
        <circle cx={CENTER} cy={CENTER} r={INNER_R} fill="none" stroke={disc.ring} strokeWidth="1" />
        <text className={slots.valueText()} textAnchor="middle" x={CENTER} y={TEXT_BASELINE_Y}>
          {coinGlyph(amount)}
        </text>
      </svg>
      {showCaption ? (
        <>
          <span aria-hidden={true} className={slots.label()} data-slot="coin-figure-label">
            {label}
          </span>
          {/* THE CAPTION IS LABEL-ONLY WHENEVER THE DISC ALREADY SAYS IT (#99 item 1, one-home-per-value).
              A RingGauge's readout earns its line — the arc states a RATIO and the text states `value/max`,
              which the arc cannot. A coin has no arc: the glyph inside the disc IS the amount, so a readout
              beneath it printed the same number twice, ~30px apart, on the panel the audit measured four
              simultaneous spellings of one value in. It returns for the ONE case where the glyph is not the
              amount — a compacted hoard (`12k`), where the exact figure has nowhere else visible to live. */}
          {coinGlyph(amount) === String(amount) ? null : (
            <span aria-hidden={true} className={slots.readout()} data-slot="coin-figure-readout">
              {amount}
            </span>
          )}
        </>
      ) : null}
      <span className="sr-only">{`${label} ${amount}`}</span>
    </div>
  );
}
