// The coarse-pointer touch floors a primitive takes through its `touchFloor` prop. Each rides the pointer-conditional
// `--size-touch-target` token and leaves a fine pointer untouched.
export const TOUCH_FLOOR_AT_COARSE = {
  /** The element's own block size: a text-height row or chip whose children's hit areas must fit inside it. */
  block: "pointer-coarse:min-block-(--size-touch-target)",
  /** The element's own inline size: a glyph-only chip that is narrower than the touch floor. */
  inline: "pointer-coarse:min-inline-(--size-touch-target)",
  /** The pitch between tiled children: a gap that makes a control-height cell's pitch the touch floor. */
  gap: "pointer-coarse:gap-block",
} as const;
