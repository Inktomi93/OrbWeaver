import { ACCENT_HOVER, DISABLED_STATE, FOCUS_RING, tv } from "#lib";

// The inline (non-popover) listbox: an in-flow `role="listbox"` whose rows are `role="option"` buttons a
// SEPARATE control drives via `aria-activedescendant` (the rows are never a tab stop — tabIndex=-1). The
// `highlighted` skin reuses the shared accent vocabulary (bg-accent/text-accent-foreground, the same look
// hover + macro-textarea's `data-highlighted` resolve to) so a keyboard user sees exactly what a pointer
// user sees on hover — never a bespoke highlight.
export const optionStripVariants = tv({
  slots: {
    listbox: "flex flex-col gap-field",
    item: [
      "flex w-full items-center gap-field rounded-control px-block py-field text-left outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      ACCENT_HOVER,
      FOCUS_RING,
      DISABLED_STATE,
    ],
    leading: "flex shrink-0 items-center justify-center text-muted-foreground",
    body: "flex min-w-0 flex-1 items-center gap-field",
    label: "font-mono text-code text-foreground",
    description: "truncate text-label leading-label text-muted-foreground",
  },
  variants: {
    highlighted: {
      true: { item: "bg-accent text-accent-foreground" },
      false: {},
    },
  },
  defaultVariants: { highlighted: false },
});
