import { DISABLED_STATE, FIELD_CONTROL, FIELD_CONTROL_BOX, FOCUS_RING, ITEM_ROW, OVERLAY_ARROW, OVERLAY_MOTION, POPUP_SURFACE, SCRIM, tv } from "#lib";

// Trigger in-flow; positioner/popup portaled. --available-height/--anchor-width are Base UI Positioner-provided vars.
export const selectVariants = tv({
  slots: {
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    trigger: [
      "flex cursor-pointer select-none items-center justify-between gap-row",
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
  variants: {
    // THE TRIGGER'S SCALE (the Input `layout` twin — same axis name, same two arms). `field` is the form
    // control: the full FIELD_CONTROL chrome at the sealed control height. `inline` is the IDENTITY-LINE
    // trigger — a name/datum that happens to open a menu, so it wears the text itself (content width,
    // text-height, no box) and the popup is the affordance.
    //
    // Both arms live here rather than at the call site because the chrome they swap is custom-token
    // (`h-control-sm`, `px-block`): twMerge cannot classify those, so an override neither wins nor loses
    // deterministically — the shipped site wrote `!h-auto !w-auto !px-field` to force the cascade. Same law
    // as Button `size`/TabsTab `layout`. Pinned by COMPUTED box in tests/ui/primitives/select/select.ct.tsx.
    layout: {
      field: { trigger: [FIELD_CONTROL, "h-control-sm"] },
      inline: { trigger: [FIELD_CONTROL_BOX, "h-auto min-h-0 w-auto border-transparent bg-transparent px-field py-0 text-label leading-label"] },
    },
  },
  defaultVariants: { layout: "field" },
});
