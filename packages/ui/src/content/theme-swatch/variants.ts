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
      row: { strip: "shrink-0 block-(--size-glyph-sm)", cell: "flex-none block-(--size-glyph-sm) inline-(--size-glyph-sm)" },
      card: { strip: "rounded-none border-0 block-(--size-preview-strip) inline-full" },
    },
  },
  defaultVariants: { size: "row" },
});
