import { tv } from "tailwind-variants";

// The selection-bar skin — bulk-action chrome (ui-package-design §12 Wave 3-C; work-order #21).
// `placement` swaps sticky-to-scroll-container (pinned to a list's bottom edge, e.g. a message or
// character list) vs a floating centered pill (elevated above the surface) — the caller picks one.
export const selectionBarVariants = tv({
  slots: {
    root: "flex items-center gap-row px-row py-field",
    count: "flex-1 text-body text-muted-foreground",
    actions: "flex items-center gap-field",
    clear:
      "inline-flex size-control-sm shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  },
  variants: {
    placement: {
      sticky: {
        root: "sticky inset-x-0 bottom-0 z-(--z-raised) border-border border-t bg-background",
      },
      floating: {
        root: "fixed inset-x-0 bottom-section z-(--z-overlay) mx-auto w-fit rounded-card border border-border bg-popover shadow-lg",
      },
    },
  },
  defaultVariants: { placement: "sticky" },
});
