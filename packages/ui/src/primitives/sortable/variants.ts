import { tv } from "tailwind-variants";

// The sortable skin (ui-package-design §6.1 item 15; contract §2). @dnd-kit/react drives the
// FLIP-style reposition transform + isDragging/isDropping state as inline styles/data-* — the tv()
// contract only owns the resting chrome (spacing, the dragging dim, the handle affordance).
export const sortableVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    item: [
      "group/sortable-item relative flex items-center gap-field rounded-control",
      "data-dragging:opacity-50",
    ],
    handle: [
      "inline-flex h-control-sm w-control-sm shrink-0 cursor-grab items-center justify-center",
      "rounded-control text-muted-foreground",
      "hover:bg-accent hover:text-accent-foreground active:cursor-grabbing",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:pointer-events-none disabled:opacity-50",
    ],
    content: "min-w-0 flex-1",
  },
});
