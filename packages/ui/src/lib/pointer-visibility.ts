// The visibility arms (`hiddenAt`, `srOnlyAt`) shared by Text, Row, Stack, Button and Badge. A feature may not spell a
// pointer variant or a `display` class, so when a box leaves layout is a primitive prop; it never keys on hover.

/**
 * The condition under which the box is `display: none`, leaving layout and the accessibility tree: a pointer class, always, while it holds no
 * children, in print, in a stacked short dialog or everywhere else, at or above a container step, or below one. Two boxes with complementary arms
 * swap one thing for another at that condition, with exactly one in layout.
 */
export const HIDDEN_AT = {
  coarse: "pointer-coarse:hidden",
  fine: "pointer-fine:hidden",
  always: "hidden",
  empty: "empty:hidden",
  print: "print:hidden",
  dialogStacked: "dialog-stacked:hidden",
  unlessDialogStacked: "hidden dialog-stacked:flex",
  "cq-20": "@cq-20:hidden",
  "cq-28": "@cq-28:hidden",
  "cq-32": "@cq-32:hidden",
  belowCq20: "@max-cq-20:hidden",
  belowCq28: "hidden @cq-28:flex",
  belowCq32: "@max-cq-32:hidden",
} as const;

/** Visually hidden at a coarse pointer, still announced: a label whose sighted job a glyph takes over on touch. */
export const SR_ONLY_AT = {
  coarse: "pointer-coarse:sr-only",
} as const;
