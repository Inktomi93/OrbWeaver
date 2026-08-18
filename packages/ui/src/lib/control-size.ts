// The control size ramp shared by button + toggle — height on the control-height tokens (so the
// ≥44px touch floor holds by construction) with the matching padding/type step. Button spreads this
// and adds an `icon` size; toggle uses it as-is.
export const CONTROL_SIZE = {
  sm: "h-control-sm px-block text-label leading-label",
  md: "h-control-md px-block text-body leading-body",
  lg: "h-control-lg px-section text-body leading-body",
} as const;

/** THE FILTER-CHIP BOX — the wrapping-rail cell, shared by button + toggle exactly the way CONTROL_SIZE
 *  is (one home, so a scope toggle and a tag button in the same rail cannot drift into two boxes).
 *
 *  It is NOT a step of the control ramp, and that is the point (density-pass-spec.md §2.1: a pill is
 *  "one of many small things to skim", a control is "something you operate"). The height is
 *  `--spacing-touch-target` — the POINTER-CONDITIONAL token, 28px under a mouse and 44px under a finger
 *  by construction rather than by a media query — so the box IS the tap floor and needs none of the
 *  hit-area pseudo the sub-control `glyph-*`/`inline` arms carry. Measured on the characters pane
 *  (program #102 variant B): 28px boxes at the `tight` atom gap run the tag rail at a 32px pitch instead
 *  of the control ramp's 38px, which is where the two section hairlines are paid for.
 *
 *  IT DOES NOT TOUCH THE WEIGHT, and that is deliberate: the approved mockup draws a chip at 400 against
 *  a command's 500, but a chip whose label is a `<Text voice="label">` (the truncation carrier every
 *  wrapping chip needs) renders that span's own weight regardless of the box's, and the only way to
 *  overrule it from a feature is a `font-*` className — the literal-shape dodge the density gate's A3 arm
 *  exists to stop. The register separation is carried by the ink, the edge and the radius instead, which
 *  are all box properties this arm and `intent` genuinely own. */
export const CHIP_BOX = "h-touch-target gap-tight px-row text-label leading-label";
