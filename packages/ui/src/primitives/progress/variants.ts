import { tv } from "#lib";

/**
 * Slot classes for the progress bar (ui-package-design §5). Distinct from `<Meter>` (magnitude):
 * this is task COMPLETION. Base UI sizes the indicator width from the value automatically; we skin
 * the `bg-muted` track + `bg-primary` fill. In the indeterminate state (value = `null`) Base UI
 * leaves the indicator full-width and flags `data-indeterminate`, which we animate as a pulse.
 * The header row carries the optional Label + the "72%" Value readout above the track.
 * `data-complete` (Base UI: value reached max) swaps the fill to the success token so a finished
 * bar reads as done, not just "still in progress at 100%".
 */
export const progressVariants = tv({
  slots: {
    root: "relative flex flex-col gap-field inline-full",
    header: "flex items-baseline justify-between gap-row inline-full",
    label: "text-label leading-label font-medium text-foreground",
    value: "text-label leading-label text-muted-foreground tabular-nums",
    track: "relative overflow-hidden rounded-full bg-muted block-field inline-full",
    // `transition-all` was catching inherited non-compositor properties, never just what this
    // indicator actually moves: Base UI sizes it via an inline `width`, and `data-complete`
    // swaps the fill token. Naming both keeps the same visible motion and drops the rest.
    indicator: `
      rounded-full bg-primary transition-[width,background-color] duration-(--motion-base) ease-out-expo block-full
      data-complete:bg-success
      data-indeterminate:animate-pulse data-indeterminate:inline-full
    `,
  },
});
