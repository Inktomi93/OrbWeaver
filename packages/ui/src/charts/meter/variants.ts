// 1-D magnitude skins. The danger state is a token swap (primary -> destructive intent), never a color calculation.
import { tv } from "#lib";

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
    // Dims the whole glyph — never the sole signal, paired with the lock glyph in the center-emphasis slot.
    hidden: { true: { root: "opacity-50" } },
  },
  defaultVariants: { size: "md" },
});
