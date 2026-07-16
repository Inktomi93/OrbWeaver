// Shared focus-ring class fragments, extracted so a drift (e.g. ring-offset-2 without
// ring-offset-background, painting a white halo on dark themes) is structurally impossible.
// _WITHIN is for input-group wrappers whose focusable child is nested; _HAS is for a decorative root
// wrapping an invisible input; _INSET drops the offset for a ring that must stay inside its own box;
// _DESTRUCTIVE composes ALONGSIDE (never instead of) FOCUS_RING.
export const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export const FOCUS_RING_WITHIN = "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background";

export const FOCUS_RING_HAS =
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background";

export const FOCUS_RING_INSET = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

// _BARE is the offset-less ring for an inner icon button (autocomplete Clear, combobox ChipRemove)
// whose parent group ALREADY carries the offset ring (FOCUS_RING_WITHIN) — an offset here would push
// the child's ring outside the group box. No offset, no inset: the ring hugs the child's own edge.
export const FOCUS_RING_BARE = "focus-visible:ring-2 focus-visible:ring-ring";

export const FOCUS_RING_DESTRUCTIVE = "data-invalid:focus-visible:ring-destructive";
