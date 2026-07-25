import { DISABLED_STATE, FIELD_CONTROL, FOCUS_RING, ITEM_ROW, OVERLAY_ARROW, OVERLAY_MOTION, POPUP_SURFACE, SCRIM, tv } from "#lib";

// Trigger in-flow; positioner/popup portaled. --available-height/--anchor-width are Base UI Positioner-provided vars.
export const selectVariants = tv({
  slots: {
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    trigger: [
      FIELD_CONTROL,
      "flex h-control-sm cursor-pointer select-none items-center justify-between gap-row",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent",
      "outline-none",
      FOCUS_RING,
      DISABLED_STATE,
    ],
    // The selected-value text stays ONE line (the app-wide single-line trigger convention) — `min-w-0` lets the
    // flex child shrink so `truncate` can ellipsize a long option label instead of wrapping to two lines.
    value: "min-w-0 truncate text-left",
    icon: "flex shrink-0 text-muted-foreground",
    positioner: "z-(--z-popover) outline-none",
    // Select's popup can GROW past the anchor for a long option, so it takes `min-w-(--anchor-width)`
    // (autocomplete/combobox lock to the exact `w-(--anchor-width)`).
    popup: [POPUP_SURFACE, "min-w-(--anchor-width)", OVERLAY_MOTION.anchoredPopup],
    group: "flex flex-col",
    groupLabel: "px-block py-field text-label font-medium leading-label text-muted-foreground select-none",
    item: [ITEM_ROW, "justify-between gap-row"],
    itemIndicator: "flex shrink-0 text-primary",
    arrow: OVERLAY_ARROW,
    separator: "-mx-field my-field h-px bg-border",
    backdrop: SCRIM("popover"),
    scrollArrow: "sticky z-(--z-raised) flex h-section w-full cursor-default items-center justify-center bg-popover text-muted-foreground",
  },
});
