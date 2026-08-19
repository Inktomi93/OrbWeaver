import { tv } from "#lib";

// The tailwind-expressible half of the bleed. Its GEOMETRY — where the band starts, and the mask that
// dissolves it — is two declarations that have no honest utility spelling (a `min()`/`calc()` inset and a
// prefixed `mask-image` pair), so those live unlayered in styles/globals.css keyed on
// `[data-slot="art-bleed"]`, the same split the gradient-fade separator uses. Read them together.
//
// `z-(--z-base)` (the semantic zero token), never a negative index: a child painted below zero paints below its HOST'S OWN BACKGROUND, so a
// `-z-10` art layer inside a filled card renders nothing at all. Zero puts it above the card's fill and
// below any positioned content beside it (later sibling wins at equal index), which is the whole stack.
// `inset-y-0 end-0`, NOT `inset-block-0 inset-inline-end-0`: the latter two are not Tailwind utilities at
// all, so they compile to NOTHING and the band shrink-to-fits its own start inset instead of reaching the
// host's edge (measured — it ended 490px short of a 1200px host, and no lint or type says a word).
export const artBleedVariants = tv({
  base: "pointer-events-none absolute inset-y-0 end-0 z-(--z-base) rounded-(--radius-card) bg-center bg-cover",
});
