import { tv } from "#lib";

// The scope is a carrier, so most scopes add no box. A scope that must take part in layout names how: `fill` as a column over its host, `glyph` as a mark
// at the glyph step, and `hidden` when it only measures what the theme resolves to.
export const themeScopeVariants = tv({
  variants: {
    box: {
      contents: "contents",
      fill: "flex flex-col block-full inline-full",
      glyph: "shrink-0 block-(--size-glyph-xs) inline-(--size-glyph-xs)",
      hidden: "hidden",
    },
  },
});
