import { tv } from "#lib";

// theme-swatch — the three-cell STRIP (base surface · card surface · accent) a menu row leads with.
// Slots/classes only — the real COLORS come from `<ThemeScope>` around these boxes, so a stripe is never a
// hand-painted approximation of a theme. The CARD slots retired with #920 (see theme-swatch.tsx).
export const themeSwatchVariants = tv({
  slots: {
    strip: "flex shrink-0 overflow-hidden rounded-inset border border-border block-(--size-glyph-sm)",
    cell: "flex-none block-(--size-glyph-sm) inline-(--size-glyph-sm)",
  },
});
