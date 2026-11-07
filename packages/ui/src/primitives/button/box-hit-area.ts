/**
 * Per button-family component (its name in camelCase), each box step and whether it supplies an overflowing,
 * layout-neutral touch target. A box below the touch floor carries its own hit-area `::before`, so its visible box can
 * shrink while the target does not; `orb/no-floorless-control-in-wrap` reads the components whose every step
 * overflows. Each component's recipe declares its box axis against its row here, so a new step states its hit area.
 */
export const BUTTON_BOX_OVERFLOW = {
  button: { chip: false, sm: false, md: false, lg: false, band: false, stacked: false },
  glyphButton: { xs: true, sm: true, md: true, lg: true },
  inlineAction: { label: true, body: true },
  /** Content-sized: the picture child is the box and owns the touch floor. */
  pictureButton: { content: false },
} as const;
