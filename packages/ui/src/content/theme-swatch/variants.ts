import { tv } from "#lib";

// theme-swatch — the three-cell STRIP (base surface · card surface · accent) a menu row leads with.
// Slots/classes only — the real COLORS come from `<ThemeScope>` around these boxes, so a stripe is never a
// hand-painted approximation of a theme. The CARD slots retired with #920 (see theme-swatch.tsx).
export const themeSwatchVariants = tv({
  slots: {
    strip: "flex overflow-hidden rounded-inset border border-border",
    cell: "flex-1",
  },
  variants: {
    /** The strip's own footprint: `row` is the menu-row leading chip; `card` is the wide head shape. */
    size: {
      row: { strip: "h-5 shrink-0", cell: "size-5 flex-none" },
      card: { strip: "h-10 w-full rounded-none border-0" },
    },
  },
  defaultVariants: { size: "row" },
});
