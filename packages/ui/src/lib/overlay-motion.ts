// Shared overlay-motion class fragments: the anchored-popup fade+scale (select/menu/popover/tooltip/
// autocomplete/combobox), the modal fade+scale (dialog/alert-dialog), and the scrim fade — composing
// from here makes a per-seal transition-class drift structurally impossible.
//
// `data-instant:duration-0`: Base UI stamps `data-instant` when an animation should be instant (e.g.
// hopping between grouped tooltips, or a focus/dismiss close). Zeroing the duration (not
// `transition-none`, which can leave a half-open frame) collapses it to instant while keeping the
// same declared properties.
//
// BOTH POPUP FRAGMENTS NAME THEIR PROPERTIES — `transition-all` was a bug here, not a shorthand, for the
// reason the toast root already carries in its own variants (TRANSITION-SWEEP, 2026-08-08). `outline-*`
// is interpolable, so `all` faded the focus ring in over the duration below, and these popups ARE focus
// stops: Base UI's floating focus manager stamps a managed `tabindex` on any `role="dialog"` floating
// element and moves focus into it on open (dialog / alert-dialog / popover — MEASURED, both CT pins
// below assert `toBeFocused()` on the popup itself). A keyboard user moving at speed saw a desaturated
// half-ring, and the ring is the one thing on these elements that must be instant.
// `all` was also silently animating the layout vars Base UI recomputes live — `max-h-(--available-height)`
// and `w-(--anchor-width)` — so a repositioned popup lagged its anchor for a frame budget it never asked
// for. Naming the set kills that too and keeps the animation compositor-friendly.
// The two names are exactly what the motion below needs: `opacity` + `scale` (Tailwind v4's `scale-95` is
// the standalone `scale` property, NOT `transform` — the Button `active:scale-95` precedent had to name it
// for the same reason). Dropping either silently kills that half of the fade+scale.
// Pinned by tests/ui/primitives/dialog/dialog.ct.tsx + tests/ui/primitives/popover/popover.ct.tsx
// (unpolled `transitionProperty` reads — a retrying matcher would wait out a fade and pass).
export const OVERLAY_MOTION = {
  anchoredPopup:
    "origin-(--transform-origin) transition-[opacity,scale] duration-(--motion-fast) ease-out-expo data-instant:duration-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  modalPopup:
    "transition-[opacity,scale] duration-(--motion-base) ease-out-expo data-instant:duration-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  backdropFade: (duration: "fast" | "base"): string =>
    `transition-opacity duration-(--motion-${duration}) ease-out-expo data-instant:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0`,
} as const;
