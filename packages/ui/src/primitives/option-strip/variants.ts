import { ACCENT_HOVER, CAPTION, COLOR_MOTION, DISABLED_STATE, FIELD_ROW, FIELD_STACK, FOCUS_RING, tv } from "#lib";

// The inline (non-popover) listbox: an in-flow `role="listbox"` whose rows are `role="option"` buttons a
// SEPARATE control drives via `aria-activedescendant` (the rows are never a tab stop — tabIndex=-1). The
// `highlighted` skin reuses the shared accent vocabulary (bg-accent/text-accent-foreground, the same look
// hover + macro-textarea's `data-highlighted` resolve to) so a keyboard user sees exactly what a pointer
// user sees on hover — never a bespoke highlight.
export const optionStripVariants = tv({
  slots: {
    listbox: FIELD_STACK,
    item: [`${FIELD_ROW} rounded-control px-block py-field text-start outline-none inline-full`, COLOR_MOTION, ACCENT_HOVER, FOCUS_RING, DISABLED_STATE],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    body: "flex flex-1 items-center gap-field min-inline-0",
    label: "truncate font-mono text-code leading-label-relaxed text-foreground",
    description: `truncate ${CAPTION}`,
  },
  variants: {
    highlighted: {
      true: { item: "bg-accent text-accent-foreground" },
      false: {},
    },
  },
  defaultVariants: { highlighted: false },
});
