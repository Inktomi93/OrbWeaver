/** Per button-family component (its name in camelCase), its box steps in render order. Each recipe's box axis reads its row. */
export const BUTTON_BOX_STEPS = {
  button: ["chip", "sm", "md", "lg"],
  glyphButton: ["xs", "sm", "md", "lg"],
  inlineAction: ["label", "body"],
  pictureButton: ["content"],
} as const;

/**
 * Per button-family component, each box step and whether it supplies an overflowing,
 * layout-neutral touch target. A box below the touch floor carries its own hit-area `::before`, so its visible box can
 * shrink while the target does not; `orb/no-floorless-control-in-wrap` reads the components whose every step
 * overflows. Each component's recipe declares its box axis against its row here, so a new step states its hit area.
 */
export const BUTTON_BOX_OVERFLOW = {
  button: { chip: false, sm: false, md: false, lg: false },
  glyphButton: { xs: true, sm: true, md: true, lg: true },
  inlineAction: { label: true, body: true },
  /** Content-sized: the picture child is the box and owns the touch floor. */
  pictureButton: { content: false },
} as const satisfies { readonly [Component in keyof typeof BUTTON_BOX_STEPS]: Readonly<Record<(typeof BUTTON_BOX_STEPS)[Component][number], boolean>> };
