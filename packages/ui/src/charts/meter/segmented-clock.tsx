// <SegmentedClock> — a segmented circle showing filled/segments (D58; rpg-design/11 §2). Lives in
// the meter group: one home for 1-D magnitude display (a standalone dir was explicitly rejected).
// Same hand-rolled ARIA mechanism as <Meter> (role="meter" + value semantics).
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { segmentedClockVariants } from "./variants";

// `filled` is Omitted from the variant props: the tv `filled` variant is the per-segment boolean
// skin switch; the public `filled` prop is the COUNT (rpg-design/11 §2 signature).
export interface SegmentedClockProps
  extends Omit<VariantProps<typeof segmentedClockVariants>, "filled"> {
  /** Total segment count — any integer ≥ 2 (4/6/8/12 fit the tabletop clocks, not enforced). */
  segments: number;
  /** Filled segment count (clamped to 0..segments). */
  filled: number;
  /**
   * The completed visual state: every segment renders at full accent plus a center-dot emphasis.
   * Semantics (what "complete" means) stay with the caller — this knows nothing of fronts.
   */
  completed?: boolean;
  /** Accessible name (aria-label). */
  label?: string;
  className?: string;
}

// Clock geometry (SVG viewBox units — named per biome noMagicNumbers).
const CLOCK_SIZE = 48;
const CLOCK_STROKE = 8;
const CLOCK_CENTER = CLOCK_SIZE / 2;
const CLOCK_RADIUS = CLOCK_CENTER - CLOCK_STROKE / 2;
const CENTER_DOT_RADIUS = 5;
/** Angular gap between segments, degrees. */
const SEGMENT_GAP_DEG = 6;
const FULL_TURN_DEG = 360;
const HALF_TURN_DEG = 180;
/** Start at 12 o'clock (SVG 0° points right). */
const TOP_DEG = -90;
const MIN_SEGMENTS = 2;

function pointAt(deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / HALF_TURN_DEG;
  return {
    x: CLOCK_CENTER + CLOCK_RADIUS * Math.cos(rad),
    y: CLOCK_CENTER + CLOCK_RADIUS * Math.sin(rad),
  };
}

function segmentPath(index: number, count: number): string {
  const span = FULL_TURN_DEG / count;
  const start = pointAt(TOP_DEG + index * span + SEGMENT_GAP_DEG / 2);
  const end = pointAt(TOP_DEG + (index + 1) * span - SEGMENT_GAP_DEG / 2);
  // large-arc flag is always 0: with ≥2 segments each arc spans < 180°.
  return `M ${start.x} ${start.y} A ${CLOCK_RADIUS} ${CLOCK_RADIUS} 0 0 1 ${end.x} ${end.y}`;
}

/**
 * Progress-clock display — `filled` of `segments` wedges at the intent accent (currentColor +
 * text-primary; empty segments drop to text-muted). Pure count display: knows nothing of fronts or
 * consequences (rpg-design/11 §2; the D58 spec).
 *
 * Usage: `<SegmentedClock segments={6} filled={clock.filled} completed={clock.completed} label="Doom" />`.
 */
export function SegmentedClock({
  segments,
  filled,
  completed,
  label,
  size,
  className,
}: SegmentedClockProps): ReactElement {
  const count = Math.max(MIN_SEGMENTS, Math.trunc(segments));
  const filledCount = Math.min(count, Math.max(0, Math.trunc(filled)));
  const isComplete = completed === true;
  const slots = segmentedClockVariants({ size });
  return (
    // biome-ignore lint/a11y/useSemanticElements: the D58 spec is ONE hand-rolled ARIA mechanism across all magnitude kinds — a native <meter> cannot render a segmented SVG circle (ui-package-design §10.4).
    <svg
      role="meter"
      aria-valuemin={0}
      aria-valuemax={count}
      aria-valuenow={isComplete ? count : filledCount}
      aria-label={label}
      viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
      data-completed={isComplete}
      className={slots.root({ className })}
    >
      <title>{label}</title>
      {Array.from({ length: count }, (_, index) => {
        const isFilled = isComplete || index < filledCount;
        return (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: a clock segment is POSITIONAL by definition — the index is its identity; there is no stabler key.
            key={index}
            data-slot="segment"
            data-filled={isFilled}
            className={slots.segment({ filled: isFilled })}
            d={segmentPath(index, count)}
            fill="none"
            stroke="currentColor"
            strokeWidth={CLOCK_STROKE}
          />
        );
      })}
      {isComplete ? (
        <circle
          data-slot="completed-dot"
          className={slots.completedDot()}
          cx={CLOCK_CENTER}
          cy={CLOCK_CENTER}
          r={CENTER_DOT_RADIUS}
          fill="currentColor"
        />
      ) : null}
    </svg>
  );
}
