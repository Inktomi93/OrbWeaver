// The control size ramp shared by button + toggle — height on the control-height tokens (so the
// ≥44px touch floor holds by construction) with the matching padding/type step. Button spreads this
// and adds an `icon` size; toggle uses it as-is.
export const CONTROL_SIZE = {
  sm: "h-control-sm px-block text-label leading-label",
  md: "h-control-md px-block text-body leading-body",
  lg: "h-control-lg px-section text-body leading-body",
} as const;
