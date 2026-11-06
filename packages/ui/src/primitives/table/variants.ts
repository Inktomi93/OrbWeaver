import { FOCUS_RING, tv } from "#lib";

// The table skin — a hand-rolled data-grid (NO @tanstack/react-table: v8's useReactTable returns
// an interior-mutable instance the React Compiler can only tolerate behind "use no memo", which
// orbweaver rejects outright — D54's neo-sin, the same reason virtual-list uses directDomUpdates
// instead of an escape hatch). Sort/paginate are pure array derivations in table.tsx; this
// file is purely the skin. `align` and `sortActive`
// vary PER COLUMN, so callers invoke those slot getters with their own per-column args (the
// log-viewer `slots.line({level})` precedent — tv slot getters accept variants at call time on
// top of whatever the factory call already baked in).
export const tableVariants = tv({
  slots: {
    root: "flex flex-col gap-block inline-full",
    scroll: "overflow-x-auto rounded-control border border-border inline-full",
    table: "border-collapse text-start inline-full",
    thead: "border-be border-border bg-muted",
    th: "px-row py-block text-label leading-label font-medium text-muted-foreground",
    sortButton: ["inline-flex cursor-pointer items-center gap-field bg-transparent font-medium text-muted-foreground inline-full", "outline-none", FOCUS_RING],
    sortIcon: "shrink-0",
    tbody: "divide-y divide-border",
    // The start rail box stays reserved (transparent) so a row's cells sit where they always have.
    tr: "border-s-rule border-s-transparent",
    td: "px-row py-block text-body leading-body text-foreground",
    emptyCell: "py-section text-center",
    pager: "flex flex-wrap items-center justify-between gap-row border-bs border-border px-row py-block",
    pagerInfo: "text-label leading-label text-muted-foreground",
    pagerButtons: "flex items-center gap-field",
  },
  variants: {
    align: {
      start: { th: "text-start", td: "text-start" },
      end: { th: "text-end", td: "text-end" },
    },
    sortActive: {
      true: { sortIcon: "text-foreground" },
      // Element opacity is not evicted by a colour arm, so the receded step rides only the idle arm.
      false: { sortIcon: "text-muted-foreground opacity-receded" },
    },
  },
  defaultVariants: { align: "start", sortActive: false },
});
