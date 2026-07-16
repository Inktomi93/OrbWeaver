import { ACCENT_HOVER, FOCUS_RING_ON_POPOVER, tv } from "#lib";

export const toastVariants = tv({
  slots: {
    // `pointer-events-none` on the region so an empty viewport never eats clicks on the controls it
    // overlaps — individual toasts opt back in via `root`'s `pointer-events-auto`.
    viewport: "pointer-events-none fixed right-0 bottom-0 z-(--z-toast) flex w-full max-w-cq-sm flex-col-reverse gap-row p-section outline-none",
    root: [
      "pointer-events-auto relative w-full rounded-card border border-border bg-popover p-block text-popover-foreground shadow-overlay",
      "transition-all duration-(--motion-base) ease-out-expo [transform:translate(var(--toast-swipe-movement-x),var(--toast-swipe-movement-y))]",
      // Enter: slide up + fade in. Exit: the reverse — slide back down + fade, not a bare opacity cut.
      "data-limited:hidden data-starting-style:opacity-0 data-starting-style:translate-y-full data-ending-style:opacity-0 data-ending-style:translate-y-full",
      // Suspend the transition while a swipe is in progress so the gesture tracks the pointer 1:1.
      "data-swiping:transition-none",
      // Written as `[&[data-type=…]]:` because biome's noSecrets heuristic false-positives on the `loading` shorthand.
      "[&[data-type=error]]:border-destructive",
      "[&[data-type=success]]:border-success",
      "[&[data-type=loading]]:border-primary",
    ],
    content: "flex flex-col gap-field",
    title: "text-label leading-label font-semibold",
    description: "text-label leading-label text-muted-foreground",
    close: `absolute top-field right-field flex size-control-sm items-center justify-center rounded-control text-muted-foreground outline-none ${ACCENT_HOVER} ${FOCUS_RING_ON_POPOVER}`,
    action: `mt-field inline-flex h-control-sm w-fit items-center justify-center gap-field whitespace-nowrap rounded-control bg-secondary px-block text-label leading-label font-medium text-secondary-foreground outline-none transition-colors duration-(--motion-fast) ease-out-expo ${ACCENT_HOVER} active:bg-accent/80 ${FOCUS_RING_ON_POPOVER}`,
  },
});
