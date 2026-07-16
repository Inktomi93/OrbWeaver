import { ACCENT_HOVER, FOCUS_RING_BARE, FOCUS_RING_WITHIN, ITEM_ROW, OVERLAY_ARROW, OVERLAY_MOTION, POPUP_SURFACE, tv } from "#lib";

// The autocomplete skin — the InputGroup carries the text-input token box (border/bg/height) so the
// native Clear button can sit flush inside it; the input fills the box transparently. The popup rides
// bg-popover + z-(--z-popover) (the stacking contract), items meet the touch floor and highlight on
// bg-accent. --available-height/--anchor-width are Base UI Positioner-provided vars, not raw values.
export const autocompleteVariants = tv({
  slots: {
    inputGroup: [
      "relative flex h-control-sm w-full min-w-0 items-center rounded-control border border-border bg-input",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      FOCUS_RING_WITHIN,
      "has-data-disabled:pointer-events-none has-data-disabled:opacity-50",
    ],
    input: ["h-full w-full min-w-0 flex-1 bg-transparent px-block text-body leading-body text-foreground", "placeholder:text-muted-foreground", "outline-none"],
    clear: [
      "mr-field flex size-control-sm shrink-0 items-center justify-center rounded-control text-muted-foreground outline-none",
      // Offset-less ring — the Clear sits INSIDE the input group, whose FOCUS_RING_WITHIN already
      // carries the offset ring; a second offset here would escape the box.
      `${ACCENT_HOVER} ${FOCUS_RING_BARE}`,
    ],
    positioner: "z-(--z-popover) outline-none",
    // Locks to the exact anchor width; enter/exit fade+scale via OVERLAY_MOTION.anchoredPopup (the
    // shared overlay animation contract). `--transform-origin` is Base UI Positioner-provided.
    popup: [POPUP_SURFACE, "w-(--anchor-width)", OVERLAY_MOTION.anchoredPopup],
    arrow: OVERLAY_ARROW,
    list: "flex flex-col gap-field",
    group: "flex flex-col gap-field",
    groupLabel: "px-block py-field text-label leading-label font-semibold text-muted-foreground",
    item: ITEM_ROW,
    empty: "px-block py-field text-body leading-body text-muted-foreground",
    // The SR live region is visually collapsed (screen-reader only) — it announces the result count
    // politely; it must stay mounted (Base UI: never `hidden`/`display:none` the Status element).
    status: "sr-only",
  },
});
