import { tv } from "#lib";

// The box a search or a citation points at: the neutral tint and its quiet edge, so the anchor reads in a long list. It
// paints while the box is `aria-current`; at rest the box draws nothing and keeps its element.
export const currentVariants = tv({
  base: "aria-current:rounded-control aria-current:bg-tone-tint-active aria-current:text-tone-text-on-tint aria-current:ring-1 aria-current:ring-tone-edge",
});
