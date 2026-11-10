import { ACCENT_HOVER, DISABLED_STATE_NATIVE, FIELD_ROW, FOCUS_RING, tv } from "#lib";

// The sortable skin (ui-package-design §6.1 item 15; contract §2). @dnd-kit/react drives the
// FLIP-style reposition transform + isDragging/isDropping state as inline styles/data-* — the tv()
// contract only owns the resting chrome (spacing, the dragging dim, the handle affordance).
export const sortableVariants = tv({
  slots: {
    // The list is the container its rows answer to. Under `cq-16` (16rem, a pane at enlarged text) the grip stops taking a column from the
    // row and sits on a line of its own above it, at the same control size, so the row keeps the list's whole width. The threshold is the
    // list's width, never the viewport's, and a rem threshold narrows a pane the way enlarged text does.
    root: "@container/sortable flex flex-col gap-row",
    item: [
      `group/sortable-item relative ${FIELD_ROW} rounded-control`,
      "data-dragging:opacity-dragging",
      "@max-cq-16/sortable:flex-col @max-cq-16/sortable:items-stretch",
    ],
    handle: [
      "inline-flex shrink-0 cursor-grab items-center justify-center block-(--size-control-sm) inline-(--size-control-sm) @max-cq-16/sortable:self-start",
      "rounded-control text-muted-foreground",
      `${ACCENT_HOVER} active:cursor-grabbing`,
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE_NATIVE,
    ],
    // A fixed row's empty grip column, so its content starts where every movable row's does.
    handleSpacer: "shrink-0 block-(--size-control-sm) inline-(--size-control-sm) @max-cq-16/sortable:hidden",
    content: "flex-1 min-inline-0",
  },
});
