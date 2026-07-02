import { tv } from "tailwind-variants";

/**
 * Slot classes for the progress bar (ui-package-design §5). Distinct from `<Meter>` (magnitude):
 * this is task COMPLETION. Base UI sizes the indicator width from the value automatically; we skin
 * the `bg-muted` track + `bg-primary` fill. In the indeterminate state (value = `null`) Base UI
 * leaves the indicator full-width and flags `data-indeterminate`, which we animate as a pulse.
 * The header row carries the optional Label + the "72%" Value readout above the track.
 */
export const progressVariants = tv({
  slots: {
    root: "relative flex w-full flex-col gap-field",
    header: "flex w-full items-baseline justify-between gap-row",
    label: "text-label font-medium leading-label text-foreground",
    value: "text-label leading-label text-muted-foreground tabular-nums",
    track: "relative h-field w-full overflow-hidden rounded-full bg-muted",
    indicator:
      "h-full rounded-full bg-primary transition-all duration-(--motion-base) ease-out-expo data-indeterminate:w-full data-indeterminate:animate-pulse",
  },
});
