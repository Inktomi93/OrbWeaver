import { FOCUS_RING, SELECTION_RAIL, tv } from "#lib";

// The table skin — a hand-rolled data-grid (NO @tanstack/react-table: v8's useReactTable returns
// an interior-mutable instance the React Compiler can only tolerate behind "use no memo", which
// orbweaver rejects outright — D54's neo-sin, the same reason virtual-list uses directDomUpdates
// instead of an escape hatch). Sort/paginate/select are pure array derivations in table.tsx; this
// file is purely the skin. `density` is table-wide (one factory call); `align` and `sortActive`
// vary PER COLUMN, so callers invoke those slot getters with their own per-column args (the
// log-viewer `slots.line({level})` precedent — tv slot getters accept variants at call time on
// top of whatever the factory call already baked in).
export const tableVariants = tv({
  slots: {
    root: "flex flex-col gap-block inline-full",
    scroll: "overflow-x-auto rounded-control border border-border inline-full",
    table: "border-collapse text-start inline-full",
    thead: "border-be border-border bg-muted",
    th: "font-medium text-muted-foreground",
    sortButton: ["inline-flex cursor-pointer items-center gap-field bg-transparent font-medium text-muted-foreground inline-full", "outline-none", FOCUS_RING],
    sortIcon: "shrink-0 text-muted-foreground/60",
    tbody: "divide-y divide-border",
    // A SELECTED ROW WEARS THE RULED ROW IDIOM (#1840, side-eye 2026-09-06 E2). It was a bare
    // `data-selected:bg-accent` — the SAME fill `ACCENT_HOVER` paints on every hovered row, menu item,
    // card and button in the app — so "the row you are pointing at" and "the row you have chosen" were one
    // colour, and the census counted accent-fill as a fifth idiom for exactly that reason. `SELECTION_RAIL`
    // is the app-wide selected-ROW spelling (2px left ember rail + the primary tone's tint, owner-ratified #485) and a
    // table row is a row; taking it collapses this carrier onto the ruled pair instead of inventing a sixth
    // spelling. The rail box is reserved transparent at rest, so selecting a row shifts no cell.
    tr: SELECTION_RAIL,
    td: "text-foreground",
    emptyCell: "py-section text-center",
    pager: "flex flex-wrap items-center justify-between gap-row border-bs border-border px-row py-block",
    pagerInfo: "text-label leading-label text-muted-foreground",
    pagerButtons: "flex items-center gap-field",
  },
  variants: {
    density: {
      default: {
        th: "px-row py-block text-label leading-label",
        td: "px-row py-block text-body leading-body",
      },
      compact: {
        th: "p-field text-label leading-label",
        td: "p-field text-label leading-label",
      },
    },
    align: {
      start: { th: "text-start", td: "text-start" },
      center: { th: "text-center", td: "text-center" },
      end: { th: "text-end", td: "text-end" },
    },
    sortActive: {
      true: { sortIcon: "text-foreground" },
      false: {},
    },
  },
  defaultVariants: { density: "default", align: "start", sortActive: false },
});
