import { ACCENT_HOVER, DISABLED_STATE_NATIVE, FIELD_ROW, FOCUS_RING, tv } from "#lib";

// The sortable skin (ui-package-design §6.1 item 15; contract §2). @dnd-kit/react drives the
// FLIP-style reposition transform + isDragging/isDropping state as inline styles/data-* — the tv()
// contract only owns the resting chrome (spacing, the dragging dim, the handle affordance).
export const sortableVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    item: [`group/sortable-item relative ${FIELD_ROW} rounded-control`, "data-dragging:opacity-dragging"],
    handle: [
      "inline-flex shrink-0 cursor-grab items-center justify-center block-(--size-control-sm) inline-(--size-control-sm)",
      "rounded-control text-muted-foreground",
      `${ACCENT_HOVER} active:cursor-grabbing`,
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE_NATIVE,
    ],
    // A fixed row's empty grip column, so its content starts where every movable row's does.
    handleSpacer: "shrink-0 block-(--size-control-sm) inline-(--size-control-sm)",
    content: "flex-1 min-inline-0",
  },
});
