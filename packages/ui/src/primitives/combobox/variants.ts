import {
  ACCENT_HOVER,
  COLOR_MOTION,
  CONTROL_MIN_BLOCK,
  DISABLED_STATE_NATIVE,
  FIELD_STACK,
  FOCUS_RING,
  FOCUS_RING_BARE,
  FOCUS_RING_WITHIN,
  INLINE_FIELD_ROW,
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
      "relative flex flex-wrap items-center gap-field rounded-control border border-input-border bg-field-fill px-field inline-full min-inline-0",
      COLOR_MOTION,
      FOCUS_RING_WITHIN,
      "has-data-disabled:pointer-events-none has-data-disabled:opacity-disabled",
    ],
    chips: "contents",
    chip: [
      `${INLINE_FIELD_ROW} rounded-full bg-secondary ps-block pe-field text-label leading-label text-secondary-foreground outline-none`,
      FOCUS_RING,
      "data-disabled:opacity-disabled",
    ],
    chipRemove: [
      "flex shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none",
      // Offset-less ring — the ChipRemove sits INSIDE the chip; an offset ring would escape it.
      `${ACCENT_HOVER} ${FOCUS_RING_BARE}`,
      DISABLED_STATE_NATIVE,
    ],
    input: [
      "flex-1 bg-transparent px-field text-field leading-field text-foreground outline-none min-inline-(--width-title-floor)",
      "placeholder:text-muted-foreground",
    ],
    positioner: "z-(--z-popover) outline-none",
    popup: [POPUP_SURFACE, "inline-(--anchor-width)", OVERLAY_MOTION.anchoredPopup],
    arrow: OVERLAY_ARROW,
    list: FIELD_STACK,
    // Grouped suggestions — same spellings as the autocomplete seal's group/groupLabel, since the two
    // listbox popups must not drift into two different grouped looks.
    group: FIELD_STACK,
    groupLabel: "px-block py-field text-label leading-label font-semibold text-muted-foreground",
    item: ITEM_ROW,
    empty: "px-block py-field text-body leading-body text-muted-foreground",
    // Visually collapsed; must stay mounted — never hidden/display:none the Status element.
    status: "sr-only",
  },
  variants: {
    // THE CONTROL SCALE (D336): the step's height, so a field sits level with the buttons and toggles of its row. The
    // type stays the field's own pointer-conditional step at every size, because iOS zooms on a smaller focused field.
    // A floor, not a height: the chips wrap onto further lines inside the one box, which grows with them. A chip is the
    // step's height less the border and the field's inline inset on both sides, so it sits as far from the top edge as
    // from the start edge; the chip step's field takes the tight inset, the widest that leaves a label-height chip.
    size: {
      chip: { inputGroup: [CONTROL_MIN_BLOCK.chip, "px-tight"], chip: "block-(--size-combobox-chip-chip)" },
      sm: { inputGroup: CONTROL_MIN_BLOCK.sm, chip: "block-(--size-combobox-chip-sm)" },
      md: { inputGroup: CONTROL_MIN_BLOCK.md, chip: "block-(--size-combobox-chip-md)" },
      lg: { inputGroup: CONTROL_MIN_BLOCK.lg, chip: "block-(--size-combobox-chip-lg)" },
    },
  },
  defaultVariants: { size: "sm" },
});
