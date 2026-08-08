// Shared focus-ring class fragments, extracted so a drift (e.g. ring-offset-2 without
// ring-offset-background, painting a white halo on dark themes) is structurally impossible.
// _WITHIN is for input-group wrappers whose focusable child is nested; _HAS is for a decorative root
// wrapping an invisible input; _INSET drops the offset for a ring that must stay inside its own box;
// _DESTRUCTIVE composes ALONGSIDE (never instead of) FOCUS_RING.
export const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

// The offset moat must match the SURFACE UNDER the control, not the page background — on a
// sidebar-toned surface (rail, docked panels) or a popover-toned surface (menu/select/combobox
// popups) the default `ring-offset-background` paints the moat in the wrong tone (north-star PP3).
// Same shape as FOCUS_RING; only the offset color differs. GLASS surfaces prefer FOCUS_RING_INSET
// (a solid offset can't match a translucent fill).
export const FOCUS_RING_ON_SIDEBAR = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

export const FOCUS_RING_ON_POPOVER = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover";

export const FOCUS_RING_WITHIN = "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background";

export const FOCUS_RING_HAS =
  "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background";

export const FOCUS_RING_INSET = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

// _BARE is the offset-less ring for an inner icon button (autocomplete Clear, combobox ChipRemove)
// whose parent group ALREADY carries the offset ring (FOCUS_RING_WITHIN) — an offset here would push
// the child's ring outside the group box. No offset, no inset: the ring hugs the child's own edge.
export const FOCUS_RING_BARE = "focus-visible:ring-2 focus-visible:ring-ring";

export const FOCUS_RING_DESTRUCTIVE = "data-invalid:focus-visible:ring-destructive";

// _OUTLINE is the ring for a focusable surface WHOSE BOX-SHADOW SLOT IS ALREADY OWNED — an elevated
// float (`shadow-overlay`), a `shadow-cta` button, anything painting a real box-shadow. Every helper
// above draws through Tailwind's ring, which IS a box-shadow: on such an element the elevation layers
// take the composite and the ring's slots stay `0 0 0 0` transparent, so the control paints NOTHING on
// focus while the class list still reads as ringed. MEASURED on the toast root (side-eye re-verify,
// `reports/scratch-ct/rv-focus.log`): under a REAL Tab, `:focus-visible` MATCHED and the computed
// box-shadow was byte-identical to its resting value — four transparent ring slots, four live
// shadow-overlay layers — a WCAG 2.4.7 failure on a `tabIndex: 0` element.
//
// `outline` is a separate paint property, so it composes with any shadow instead of competing for it.
// The element must NOT also carry `outline-none`: Tailwind v4's `outline-none` sets
// `--tw-outline-style: none`, and the width utility resolves its style FROM that variable, so a
// `focus-visible:outline-2` layered on top still computes `outline-style: none` (the exact trap the
// toast fell into). Rest is already outline-less by UA default — there is nothing to reset.
export const FOCUS_RING_OUTLINE = "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";
