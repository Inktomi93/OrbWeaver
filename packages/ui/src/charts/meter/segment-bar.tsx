// SegmentBar — the STACKED composition bar (the context-budget bar). One rail
// whose width is partitioned between N categorical series, each tinted by a `--color-track-N` ramp step. The
// TrackBar's sibling: TrackBar answers "how full is ONE magnitude", SegmentBar answers "how is ONE whole
// DIVIDED" — the legitimate categorical use of the ramp (data series, not decoration).
//
// Same a11y model as the rest of the tracker kit (§4.9): the bar is `aria-hidden` DECORATION — the accessible
// datum is the TEXT the consuming block renders (the total line + the per-series rows). A stacked bar can
// never be color-alone meaning here, because every segment has a matching labelled text row beside it.
import type { ReactElement } from "react";
import { cn } from "#lib";
import type { TrackColor } from "./track-bar.tsx";
import { segmentBarVariants, TRACK_FILL } from "./variants.ts";

/** One series' share of the whole. `value` is in the caller's own unit (tokens, bytes, rows) — the widths are
 *  computed as a fraction, so the unit never reaches this component. */
export interface SegmentBarSegment {
  /** A stable identity for the segment (React key) — the series name/id the caller already has. */
  id: string;
  /** The series magnitude in the caller's unit. Non-positive values are dropped (never a 0-width sliver). */
  value: number;
  /** Which `--color-track-N` tints this segment (categorical, by definition order). */
  color: TrackColor;
}

export interface SegmentBarProps {
  /** The series, in render order (left → right). */
  segments: readonly SegmentBarSegment[];
  /** The DOMAIN total. When it exceeds Σ`value` the remainder stays EMPTY rail — visible headroom (a context
   *  window with room left; this is what the Preview tab passes, per the owner's fill-vs-headroom ruling).
   *  Omit ⇒ the segments partition the FULL rail (pure composition) — for the cases where no domain total is
   *  KNOWN, so drawing a proportion would invent one. */
  total?: number;
  className?: string;
}

const FULL_PERCENT = 100;

export function SegmentBar({ segments, total, className }: SegmentBarProps): ReactElement {
  const present = segments.filter((s) => s.value > 0);
  const sum = present.reduce((acc, s) => acc + s.value, 0);
  // The denominator: an explicit domain total (headroom shows) clamped to at least the sum — a total SMALLER
  // than the sum would otherwise overflow the rail and silently misdraw an over-budget composition.
  const denominator = Math.max(total ?? sum, sum);
  const slots = segmentBarVariants();
  return (
    <div aria-hidden={true} className={cn(slots.root(), className)} data-slot="segment-bar">
      {present.map((segment) => (
        <div
          className={cn(slots.segment(), TRACK_FILL[segment.color])}
          data-segment={segment.id}
          data-slot="segment-bar-segment"
          key={segment.id}
          // Width is DATA (a runtime fraction has no token home); the color is a ramp token.
          style={{ width: `${denominator === 0 ? 0 : (segment.value / denominator) * FULL_PERCENT}%` }}
        />
      ))}
    </div>
  );
}
