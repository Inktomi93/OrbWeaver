// @orb/ui/meter variants — 1-D magnitude skins (D52/D58; rpg-design/11 §2). The danger state is a
// TOKEN SWAP (primary → destructive intent), never a color calculation.
import { tv } from "tailwind-variants";

/** Linear meter skin — div track + fill (rpg-design/11 §2 `progress_bar`). */
export const linearMeter = tv({
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
export const arcMeter = tv({
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
export const bipolarMeter = tv({
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
export const segmentedClock = tv({
  slots: {
    root: "text-primary",
    segment: "text-primary",
    completedDot: "text-primary",
  },
  variants: {
    size: {
      sm: { root: "size-control-sm" },
      md: { root: "size-control-md" },
      lg: { root: "size-control-lg" },
    },
    filled: { false: { segment: "text-muted" } },
  },
  defaultVariants: { size: "md" },
});
