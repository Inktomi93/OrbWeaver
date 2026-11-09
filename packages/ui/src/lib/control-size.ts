// The D336 control scale: one height per step, shared by every control, so a row of mixed controls at one step is one
// height. Each step rides a pointer-conditional size token, which keeps the touch floor by construction. Tailwind never
// assembles class names, so each fragment below is a whole literal per step.

/** The control scale, smallest first. */
export const CONTROL_SIZES = ["chip", "sm", "md", "lg"] as const;

export type ControlSize = (typeof CONTROL_SIZES)[number];

/**
 * The step's height. `chip` is `--size-touch-target`, never a `--size-control-*` step (D336): the box IS the tap floor,
 * 28px under a mouse and 44px under a finger.
 */
export const CONTROL_BLOCK = {
  chip: "block-(--size-touch-target)",
  sm: "block-(--size-control-sm)",
  md: "block-(--size-control-md)",
  lg: "block-(--size-control-lg)",
} as const satisfies Record<ControlSize, string>;

/** The step's height as a floor, for a box whose content may grow it: a wrapping label, a field of chips. */
export const CONTROL_MIN_BLOCK = {
  chip: "min-block-(--size-touch-target)",
  sm: "min-block-(--size-control-sm)",
  md: "min-block-(--size-control-md)",
  lg: "min-block-(--size-control-lg)",
} as const satisfies Record<ControlSize, string>;

/** The step's height as an inline size, for a square box: an icon-only control, a stepper, a swatch trigger. */
export const CONTROL_INLINE = {
  chip: "inline-(--size-touch-target)",
  sm: "inline-(--size-control-sm)",
  md: "inline-(--size-control-md)",
  lg: "inline-(--size-control-lg)",
} as const satisfies Record<ControlSize, string>;

/** The height of a control that carries a label: the step is a floor, so a label that outgrows its column breaks between its
 *  words and the box grows with the lines. `block-fit` (not `auto`) keeps a flex or grid parent from stretching the box, and
 *  the tight inset keeps one line inside every step at a fine pointer. */
const LABEL_BOX = {
  chip: `${CONTROL_MIN_BLOCK.chip} block-fit py-tight whitespace-normal`,
  sm: `${CONTROL_MIN_BLOCK.sm} block-fit py-tight whitespace-normal`,
  md: `${CONTROL_MIN_BLOCK.md} block-fit py-tight whitespace-normal`,
  lg: `${CONTROL_MIN_BLOCK.lg} block-fit py-tight whitespace-normal`,
} as const satisfies Record<ControlSize, string>;

/** THE FILTER-CHIP BOX — the wrapping-rail cell.
 *
 *  A pill is "one of many small things to skim", a control is "something you operate" (UI-Density-Law §2.1), so the
 *  chip keeps the tight atom gap and the row inset. Measured on the characters pane: 28px boxes at the `tight` atom gap
 *  run the tag rail at a 32px pitch instead of the `sm` step's 38px, which is where the two section hairlines are paid
 *  for.
 *
 *  IT DOES NOT TOUCH THE WEIGHT, and that is deliberate: a chip whose label is a `<Text voice="label">` (the truncation
 *  carrier every wrapping chip needs) renders that span's own weight regardless of the box's, and the only way to
 *  overrule it from a feature is a `font-*` className. The register separation is carried by the ink, the edge and the
 *  radius instead, which are box properties the pressable primitives own. */
const CHIP_BOX = `${LABEL_BOX.chip} gap-tight px-row text-label leading-label`;

/** A pressable control's box per step: the height floor, inline padding, type step and word-wrapping label (D336). Button and Toggle take it whole. */
export const CONTROL_SIZE = {
  chip: CHIP_BOX,
  sm: `${LABEL_BOX.sm} px-block text-label leading-label`,
  md: `${LABEL_BOX.md} px-block text-body leading-body`,
  lg: `${LABEL_BOX.lg} px-section text-body leading-body`,
} as const satisfies Record<ControlSize, string>;
