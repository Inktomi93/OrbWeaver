import { tv } from "tailwind-variants";

/**
 * Slot classes for the progress bar (ui-package-design §5). Distinct from `<Meter>` (magnitude):
 * this is task COMPLETION. Base UI sizes the indicator width from the value automatically; we skin
 * the `bg-muted` track + `bg-primary` fill. In the indeterminate state (value = `null`) Base UI
 * leaves the indicator full-width and flags `data-indeterminate`, which we animate as a pulse.
 */
export const progressVariants = tv({
  slots: {
    root: "relative w-full",
    track: "relative h-field w-full overflow-hidden rounded-full bg-muted",
    indicator:
      "h-full rounded-full bg-primary transition-all duration-(--motion-base) ease-out-expo data-indeterminate:w-full data-indeterminate:animate-pulse",
  },
});
