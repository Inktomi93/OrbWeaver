import { ACCENT_HOVER, DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

// The sortable skin (ui-package-design §6.1 item 15; contract §2). @dnd-kit/react drives the
// FLIP-style reposition transform + isDragging/isDropping state as inline styles/data-* — the tv()
// contract only owns the resting chrome (spacing, the dragging dim, the handle affordance).
export const sortableVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    item: ["group/sortable-item relative flex items-center gap-field rounded-control", "data-dragging:opacity-50"],
    handle: [
      "inline-flex h-control-sm w-control-sm shrink-0 cursor-grab items-center justify-center",
      "rounded-control text-muted-foreground",
      `${ACCENT_HOVER} active:cursor-grabbing`,
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE_NATIVE,
    ],
    content: "min-w-0 flex-1",
  },
});
