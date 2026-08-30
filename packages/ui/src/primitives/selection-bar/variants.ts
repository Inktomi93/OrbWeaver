import { tv } from "#lib";

// The selection-bar skin — bulk-action chrome (ui-package-design §12 Wave 3-C; work-order #21).
// `placement` swaps sticky-to-scroll-container (pinned to a list's bottom edge, e.g. a message or
// character list) vs a floating centered pill (elevated above the surface) — the caller picks one.
export const selectionBarVariants = tv({
  // THE COUNT IS ONE PHRASE, AND THE ACTIONS ARE WHAT GIVES (side-eye 2026-08-30 rail-characters P3, #843).
  // In the characters LIST pane at its docked 290px the bar over-constrained and the count broke mid-phrase
  // — `1` on one line, `selected` on the next — because `flex-1` lets the count shrink below its content
  // and nothing stopped it wrapping. `whitespace-nowrap` makes it indivisible (it is never long: the
  // longest form this primitive can render is a number plus one word), and `flex-wrap` on the root sends
  // the ACTION cluster to a second line instead, which is the give that should have been there: an action
  // row is a set of separate things and reads fine stacked, a sentence does not.
  slots: {
    root: "flex flex-wrap items-center gap-row px-row py-field",
    count: "flex-1 whitespace-nowrap text-body text-muted-foreground",
    actions: "flex items-center gap-field",
  },
  variants: {
    placement: {
      sticky: {
        root: "sticky inset-x-0 bottom-0 z-(--z-raised) border-border border-t bg-background",
      },
      floating: {
        root: "fixed inset-x-0 bottom-section z-(--z-overlay) mx-auto w-fit rounded-card border border-border bg-popover shadow-overlay",
      },
    },
  },
  defaultVariants: { placement: "sticky" },
});
