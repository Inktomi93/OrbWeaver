import {
  ACCENT_HOVER,
  DISABLED_STATE_NATIVE,
  FOCUS_RING,
  FOCUS_RING_BARE,
  FOCUS_RING_WITHIN,
  ITEM_ROW,
  OVERLAY_ARROW,
  OVERLAY_MOTION,
  POPUP_SURFACE,
  tv,
} from "#lib";

// Chips render as pills flowing inline with the draft input inside ONE wrapping box (`chips` rides
// `contents` so its children become direct flex items of `inputGroup`, wrapping line-by-line together).
export const comboboxVariants = tv({
  slots: {
    inputGroup: [
      "relative flex min-h-control-sm w-full min-w-0 flex-wrap items-center gap-field rounded-control border border-border bg-input px-field py-field",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      FOCUS_RING_WITHIN,
      "has-data-disabled:pointer-events-none has-data-disabled:opacity-50",
    ],
    chips: "contents",
    chip: [
      "inline-flex items-center gap-field rounded-full bg-secondary py-field pr-field pl-block text-label leading-label text-secondary-foreground outline-none",
      FOCUS_RING,
      "data-disabled:opacity-50",
    ],
    chipRemove: [
      "flex shrink-0 items-center justify-center rounded-full text-secondary-foreground/70 outline-none",
      // Offset-less ring — the ChipRemove sits INSIDE the chip; an offset ring would escape it.
      `${ACCENT_HOVER} ${FOCUS_RING_BARE}`,
      DISABLED_STATE_NATIVE,
    ],
    input: ["min-w-24 flex-1 bg-transparent px-field py-field text-body leading-body text-foreground outline-none", "placeholder:text-muted-foreground"],
    positioner: "z-(--z-popover) outline-none",
    popup: [POPUP_SURFACE, "w-(--anchor-width)", OVERLAY_MOTION.anchoredPopup],
    arrow: OVERLAY_ARROW,
    list: "flex flex-col gap-field",
    // Grouped suggestions — same spellings as the autocomplete seal's group/groupLabel, since the two
    // listbox popups must not drift into two different grouped looks.
    group: "flex flex-col gap-field",
    groupLabel: "px-block py-field text-label leading-label font-semibold text-muted-foreground",
    item: ITEM_ROW,
    empty: "px-block py-field text-body leading-body text-muted-foreground",
    // Visually collapsed; must stay mounted — never hidden/display:none the Status element.
    status: "sr-only",
  },
});
