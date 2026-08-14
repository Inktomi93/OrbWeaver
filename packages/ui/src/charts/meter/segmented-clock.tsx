// A segmented circle showing filled/segments — same hand-rolled ARIA mechanism as <Meter> (role="meter").
// Consumer: the rpg quests tab (active-quest clock-ring cards) — the PREBUILT marker was deleted when it
// landed (Core-Enforcement-Deferred-Dropped.md §PREBUILT).
import type { ReactElement } from "react";
import type { VariantProps } from "tailwind-variants";
import { ICON_XS, Icon, Lock } from "#primitives/icons";
import { segmentedClockVariants } from "./variants.ts";

export interface SegmentedClockProps extends Omit<VariantProps<typeof segmentedClockVariants>, "filled" | "hidden"> {
  /** Total segment count — any integer ≥ 2. */
  segments: number;
  /** Filled segment count (clamped to 0..segments). */
  filled: number;
  /** Completed visual state: every segment renders at full accent plus a center-dot emphasis. */
  completed?: boolean;
  /** GM-eyes redaction: dims to a "hidden from players" treatment with a lock glyph; wins over completed-dot. */
  hidden?: boolean;
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
/** The hidden-lock glyph's top-left offset, centering an ICON_XS square on CLOCK_CENTER. */
const HIDDEN_ICON_OFFSET = CLOCK_CENTER - ICON_XS / 2;
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

/** Progress-clock display — `filled` of `segments` wedges. Pure count display: knows nothing of fronts. */
export function SegmentedClock({ segments, filled, completed, hidden, label, size, className }: SegmentedClockProps): ReactElement {
  const count = Math.max(MIN_SEGMENTS, Math.trunc(segments));
  const filledCount = Math.min(count, Math.max(0, Math.trunc(filled)));
  const isComplete = completed === true;
  const isHidden = hidden === true;
  const slots = segmentedClockVariants({ size, hidden: isHidden });
  let centerSlot: ReactElement | null = null;
  if (isHidden) {
    centerSlot = (
      <g data-slot="hidden-icon" transform={`translate(${HIDDEN_ICON_OFFSET} ${HIDDEN_ICON_OFFSET})`}>
        <Icon className={slots.hiddenIcon()} icon={Lock} label="Hidden from players" size="xs" />
      </g>
    );
  } else if (isComplete) {
    centerSlot = (
      <circle className={slots.completedDot()} cx={CLOCK_CENTER} cy={CLOCK_CENTER} data-slot="completed-dot" fill="currentColor" r={CENTER_DOT_RADIUS} />
    );
  }
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
      data-hidden={isHidden}
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
      {centerSlot}
    </svg>
  );
}
