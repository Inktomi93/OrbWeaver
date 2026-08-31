import { FOCUS_RING, tv } from "#lib";

// theme-swatch — the ONE swatch anatomy every theme-picker mount shares (#866 S4, owner addendum #3):
// the STRIP (three derived cells: base surface · card surface · accent) and the CARD (strip over a name
// row; the selected card wears the ring). Slots/classes only — the real COLORS come from `<ThemeScope>`
// around these boxes, so a stripe is never a hand-painted approximation of a theme.
export const themeSwatchVariants = tv({
  slots: {
    strip: "flex overflow-hidden rounded-inset border border-border",
    cell: "flex-1",
    card: [
      "group flex w-full min-w-0 flex-col overflow-hidden rounded-control border border-border bg-card text-left outline-none",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "hover:border-ring",
      FOCUS_RING,
      "aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary",
    ],
    cardStrip: "flex h-10 w-full",
    cardBody: "flex min-w-0 items-center justify-between gap-field px-field py-tight",
  },
  variants: {
    /** The strip's own footprint: `row` is the ListRow-leading chip; `card` fills the card's head. */
    size: {
      row: { strip: "h-5 shrink-0", cell: "size-5 flex-none" },
      card: { strip: "h-10 w-full rounded-none border-0" },
    },
  },
  defaultVariants: { size: "row" },
});
