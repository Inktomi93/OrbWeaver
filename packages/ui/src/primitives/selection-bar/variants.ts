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
  //
  // THE GIVE IS THE ACTION CLUSTER, AND NOW IT ACTUALLY IS (#1137, side-eye Characters F10). The paragraph
  // above says the wrap should send the ACTIONS to a second line — but the wrap was on the ROOT, whose last
  // child is the dismiss, so what actually went to the second line was `Clear selection`: measured on the
  // characters bulk bar as a lone 34x34 glyph on its own row 40px below the count, left-aligned, consuming
  // a whole row to hold one dismiss — the bar's EXIT as the least discoverable thing in it. The wrap moves
  // INTO the action cluster: the count stays one indivisible phrase, the actions stack among themselves
  // when the bar is narrow, and the dismiss keeps the bar's trailing edge on the first row where a user
  // looks for it. The count is `flex-none` rather than `flex-1` because the actions now carry the growth
  // (`justify-end` holds them against the dismiss instead of drifting into the middle).
  slots: {
    root: "flex items-center gap-row px-row py-field",
    count: "flex-none whitespace-nowrap text-body leading-body text-muted-foreground",
    actions: "flex min-w-0 flex-1 flex-wrap items-center justify-end gap-field",
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
