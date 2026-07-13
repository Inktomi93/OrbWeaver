// Shared overlay-motion class fragments: the anchored-popup fade+scale (select/menu/popover/tooltip/
// autocomplete/combobox), the modal fade+scale (dialog/alert-dialog), and the scrim fade — composing
// from here makes a per-seal transition-class drift structurally impossible.
//
// `data-instant:duration-0`: Base UI stamps `data-instant` when an animation should be instant (e.g.
// hopping between grouped tooltips, or a focus/dismiss close). Zeroing the duration (not
// `transition-none`, which can leave a half-open frame) collapses it to instant while keeping the
// same declared properties.
export const OVERLAY_MOTION = {
  anchoredPopup:
    "origin-(--transform-origin) transition-all duration-(--motion-fast) ease-out-expo data-instant:duration-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  modalPopup:
    "transition-all duration-(--motion-base) ease-out-expo data-instant:duration-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:scale-95 data-ending-style:opacity-0",
  backdropFade: (duration: "fast" | "base"): string =>
    `transition-opacity duration-(--motion-${duration}) ease-out-expo data-instant:duration-0 data-starting-style:opacity-0 data-ending-style:opacity-0`,
} as const;
