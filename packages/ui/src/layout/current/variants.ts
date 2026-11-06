import { tv } from "#lib";

// The box a search or a citation points at: the neutral tint and its quiet edge, so the anchor reads in a long list. It
// paints while the box is `aria-current`; at rest the box draws nothing and keeps its element.
export const currentVariants = tv({
  base: "aria-current:rounded-control aria-current:bg-tone-tint-active aria-current:text-tone-text-on-tint aria-current:ring aria-current:ring-tone-edge",
});

// A grid row's mark is painted on a layer outset by the `tight` step, so its label sits inside the fill instead of on its
// edge and the row's own box, padding and tracks do not move (a settings row is a subgrid track). The ring is the
// form-control edge, which holds the 3:1 non-text floor on the grounds the row sits on; the quiet tone edge does not.
export const currentGridVariants = tv({
  base: `
    aria-current:relative aria-current:isolate aria-current:text-tone-text-on-tint
    aria-current:before:pointer-events-none aria-current:before:absolute aria-current:before:-inset-tight aria-current:before:-z-1
    aria-current:before:rounded-control aria-current:before:bg-tone-tint-active aria-current:before:ring aria-current:before:ring-input-border
  `,
});
