import { tv } from "#lib";

// The selection-bar skin — bulk-action chrome (ui-package-design §12 Wave 3-C; work-order #21).
// The bar is sticky to the bottom edge of its scroll container (a message or character list).
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
  //
  // THE DISMISS IS NOT IN THE WRAP. The count and the actions wrap inside `body`; the root is a row of two, `body` and the
  // dismiss, so when the actions go below the count the dismiss stays on the first line at the trailing edge. A dismiss in
  // the same wrapping row as the actions follows them down, alone, when the count and the actions just fit.
  //
  // THE BAR NEVER SHRINKS BELOW ITS CONTENT. It is a flex item in its pane's column beside a list whose floor does not give
  // (ui-package-design §6.1), so a shrinkable bar paid for the floor and clipped to a strip. `shrink-0` leaves the one bound
  // to `usePinnedBarCap`; when the floor and the capped bar do not fit together, the pane scrolls. The cap is the larger of
  // its share of the scroller and one of the bar's controls shown whole: a cap below the smallest thing the bar holds
  // leaves nothing in it pressable.
  //
  // `min-inline-fit` bounds that minimum by the bar's own width: a group that is wider than the bar (enlarged text) wraps among
  // its own items on a line of its own, where its nowrap width would push the last verb past the pane's edge.
  //
  // THE ACTION CLUSTER NEVER SHRINKS BELOW ITS WIDEST ITEM, AND THE BODY WRAPS AROUND IT. A caller that hands the
  // cluster one nowrap group (the characters bar's three verbs) makes the cluster's minimum the whole group, so
  // when count + group do not fit one line beside the dismiss, the group moves below the count TOGETHER, rather
  // than overflowing the cluster over the count or splitting the group. Callers whose items wrap
  // among themselves keep their one-line bar: their cluster's minimum is one item.
  slots: {
    root: "sticky inset-x-0 inset-be-0 z-(--z-raised) flex shrink-0 items-start gap-row border-bs border-border bg-background px-row py-field",
    body: "flex flex-1 flex-wrap items-center gap-row min-inline-0",
    count: "flex-none text-body leading-body whitespace-nowrap text-muted-foreground",
    actions: "flex flex-1 flex-wrap items-center justify-end gap-field min-inline-fit",
    clear: "flex-none",
  },
  // A bar that would fill its pane (`usePinnedBarCap`) holds to a share of it and scrolls the rest inside, so the rows under it stay reachable.
  variants: {
    capped: { true: { root: "overflow-y-auto overscroll-contain" } },
  },
});
