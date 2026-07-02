// @orb/ui/meter variants — 1-D magnitude skins (D52/D58; rpg-design/11 §2). The danger state is a
// TOKEN SWAP (primary → destructive intent), never a color calculation.
import { tv } from "tailwind-variants";

/**
 * The Base UI Meter.Root wrapper skin — the role="meter" container that holds the optional
 * label/value readout row above the geometry. `kind` sets the container flow (bars stretch full
 * width; the arc gauge is content-sized).
 */
export const meterVariants = tv({
  slots: {
    root: "flex flex-col gap-field",
    header: "flex items-center justify-between gap-block",
    label: "text-label font-medium leading-label text-foreground",
    value: "text-label leading-label text-muted-foreground tabular-nums",
  },
  variants: {
    kind: {
      linear: { root: "w-full" },
      bipolar: { root: "w-full" },
      arc: { root: "w-max items-center" },
    },
  },
});

/** Linear meter skin — div track + fill (rpg-design/11 §2 `progress_bar`). */
export const linearMeterVariants = tv({
  slots: {
    root: "relative h-field w-full overflow-hidden rounded-full bg-muted",
    fill: "h-full rounded-full bg-primary",
    tick: "absolute inset-y-0 w-px bg-background",
  },
  variants: {
    danger: { true: { fill: "bg-destructive" } },
  },
});

/** Arc (gauge) meter skin — SVG stroke ramp; colors ride currentColor via text-* tokens. */
export const arcMeterVariants = tv({
  slots: {
    root: "block size-control-lg",
    track: "text-muted",
    fill: "text-primary",
  },
  variants: {
    danger: { true: { fill: "text-destructive" } },
  },
});

/** Bipolar meter skin — center-origin −/+ fill over a shared track (rpg-design/11 §2 `relationship_meter`). */
export const bipolarMeterVariants = tv({
  slots: {
    root: "relative h-field w-full overflow-hidden rounded-full bg-muted",
    fill: "absolute inset-y-0 bg-primary",
    origin: "absolute inset-y-0 w-px bg-foreground",
    tick: "absolute inset-y-0 w-px bg-background",
  },
  variants: {
    danger: { true: { fill: "bg-destructive" } },
  },
});

/**
 * `<SegmentedClock>` skin — intent accent via currentColor + text-primary; empty segments drop to
 * text-muted; size on the control-height token scale (rpg-design/11 §2).
 */
export const segmentedClockVariants = tv({
  slots: {
    root: "text-primary",
    segment: "text-primary",
    completedDot: "text-primary",
    hiddenIcon: "text-primary",
  },
  variants: {
    size: {
      sm: { root: "size-control-sm" },
      md: { root: "size-control-md" },
      lg: { root: "size-control-lg" },
    },
    filled: { false: { segment: "text-muted" } },
    // GM-eyes redaction (A4): dims the whole glyph — never the sole signal, paired with the lock
    // glyph that takes the center-emphasis slot (segmented-clock.tsx) so colorblind viewers still
    // get a non-color "this clock is hidden from players" tell.
    hidden: { true: { root: "opacity-50" } },
  },
  defaultVariants: { size: "md" },
});
