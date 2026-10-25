// The pointer-class visibility arms (`hiddenAt`, `srOnlyAt`) shared by Text, Row, Stack and Button. A feature
// may not spell a pointer variant, so a device-class swap is a primitive prop; it never keys on hover.

/** `display: none` at one pointer class: the element and its text leave layout and the accessibility tree. */
export const HIDDEN_AT = {
  coarse: "pointer-coarse:hidden",
  fine: "pointer-fine:hidden",
} as const;

/** Visually hidden at a coarse pointer, still announced: a label whose sighted job a glyph takes over on touch. */
export const SR_ONLY_AT = {
  coarse: "pointer-coarse:sr-only",
} as const;
